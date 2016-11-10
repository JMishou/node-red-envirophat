
module.exports = function(RED) {
    "use strict";
    var fs = require('fs');
    var spawn = require('child_process').spawn;

    var hatCommand = __dirname+'/envirophat';

    if (!fs.existsSync('/usr/local/lib/python2.7/dist-packages/envirophat')) {
        throw "Error: Can't find enviro phat python libraries. Run 'sudo curl -sS get.pimoroni.com/envirophat | bash'";
    }

    if ( !(1 & parseInt((fs.statSync(hatCommand).mode & parseInt ("777", 8)).toString(8)[0]) )) {
        throw "Error: "+RED._("node-red:rpi-gpio.errors.mustbeexecutable");
    }

    // the magic to make python print stuff immediately
    process.env.PYTHONUNBUFFERED = 1;
    // Xaccel.x,y,z,mag.x,y,z,compass
    var HF_RE = /^M(.+),(.+),(.+),(.+),(.+),(.+),(.+)$/;
    //  Ytemperature,pressure,light,r,g,b
    var LF_RE = /^E(.+),(.+),(.+),(.+),(.+),(.+)$/;

    var HAT = (function() {
        var hat = null;
        var onclose = null;
        var users = [];
        var motionUsers = 0;
        var envUsers = 0;
        var reconnectTimer = null;
        var connect = function() {
            reconnectTimer = null;
            var buffer = "";
            hat = spawn(hatCommand);
            hat.stdout.on('data', function (data) {
                buffer += data.toString();
                var lines = buffer.split("\n");
                if (lines.length == 1) {
                    return;
                }
                buffer = lines.pop();
                var m,msg;
                for (var i=0;i<lines.length;i++) {
                    var line = lines[i];
                    msg = null;
                    if ((m = LF_RE.exec(line)) !== null) {
                        msg = {
                            topic: "environment",
                            payload: {temperature: Number(m[1]), pressure: Number(m[2]), light: Number(m[3]), red: Number(m[4]), green: Number(m[5]), blue: Number(m[6])}
                        }
                    } else if ((m = HF_RE.exec(line)) !== null) {
                        // Xaccel.x,y,z,gyro.x,y,z,orientation.roll,pitch,yaw,compass
                        msg = {
                            topic: "motion",
                            payload: {
                                acceleration: {
                                    x: Number(m[1]),
                                    y: Number(m[2]),
                                    z: Number(m[3])
                                },
                                magnetics: {
                                    x: Number(m[4]),
                                    y: Number(m[5]),
                                    z: Number(m[6])
                                },
                                compass: Number(m[7])
                            }
                        }
                    }
                    if (msg && !onclose) {
                        for (var j=0;j<users.length;j++) {
                            var node = users[j];

                            if (node.motion && msg.topic === "motion") {
                                node.send(RED.util.cloneMessage(msg));
                            } else if (node.env && msg.topic === 'environment') {
                                node.send(RED.util.cloneMessage(msg));
                            }
                        }
                    }
                }
            });
            hat.stderr.on('data', function (data) {
                // Any data on stderr means a bad thing has happened.
                // Best to kill it and let it reconnect.
                if (RED.settings.verbose) { RED.log.error("err: "+data+" :"); }
                //hat.kill('SIGKILL');


            });
            hat.stderr.on('error', function(err) { });
            hat.stdin.on('error', function(err) { });

            hat.on('close', function (code) {
                hat = null;
                users.forEach(function(node) {
                    node.status({fill:"red",shape:"ring",text:"node-red:common.status.disconnected"});
                });
                if (RED.settings.verbose) { RED.log.info(RED._("node-red:rpi-gpio.status.closed")); }
                if (onclose) {
                    onclose();
                    onclose = null;
                } else if (!reconnectTimer) {
                    reconnectTimer = setTimeout(function() {
                        connect();
                    },5000);
                }
            });

            hat.on('error', function (err) {
                if (err.errno === "ENOENT") { RED.log.error(RED._("node-red:rpi-gpio.errors.commandnotfound")); }
                else if (err.errno === "EACCES") { RED.log.error(RED._("node-red:rpi-gpio.errors.commandnotexecutable")); }
                else {
                    RED.log.error(RED._("node-red:rpi-gpio.errors.error")+': ' + err.errno);
                }
            });

            if (motionUsers > 0) {
                hat.stdin.write('M1\n');
            }
            if (envUsers > 0) {
                hat.stdin.write('E1\n');
            }

        }

        var disconnect = function(done) {
            if (hat !== null) {
                onclose = done;
                hat.kill('SIGKILL');
                hat = null;
            }
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }

        }


        return {
            open: function(node) {
                if (!hat) {
                    connect();
                }
                if (!reconnectTimer) {
                    node.status({fill:"green",shape:"dot",text:"node-red:common.status.connected"});
                }

                if (node.motion) {
                    if (motionUsers === 0) {
                        hat.stdin.write('M1\n');
                    }
                    motionUsers++;
                }
                if (node.env) {
                    if (envUsers === 0) {
                        hat.stdin.write('E1\n');
                    }
                    envUsers++;
                }
                hat.stdin.write('IM'+ node.motionint + '\n');
                hat.stdin.write('IE'+ node.envint + '\n');

                users.push(node);
            },
            close: function(node,done) {
                if (node.motion) {
                    motionUsers--;
                    if (motionUsers === 0) {
                        hat.stdin.write('M0\n');
                    }
                }
                if (node.env) {
                    envUsers--;
                    if (envUsers === 0) {
                        hat.stdin.write('E0\n');
                    }
                }
                users.splice(users.indexOf(node),1);
                if (users.length === 0) {
                    disconnect(done);
                } else {
                    done();
                }
            },
            send: function(msg) {
                if (hat) {
                    hat.stdin.write(msg+'\n');
                }
            }
        }
    })();


    function envirophatInNode(n) {
        RED.nodes.createNode(this,n);
        this.motion = n.motion;
        this.env = n.env;
        this.motionint = n.motionint
        this.envint = n.envint
        var node = this;
        node.status({fill:"red",shape:"ring",text:"node-red:common.status.disconnected"});
        HAT.open(this);

        node.on("close", function(done) {
            HAT.close(this,done);
        });
    }
    RED.nodes.registerType("rpi-envirophat in",envirophatInNode);
}
