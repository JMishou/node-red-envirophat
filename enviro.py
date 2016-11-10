#! /usr/bin/python

# Commands:
#  X[0|1] - high frequency reporting (accel/mags/compass) off|on
#  Y[0|1] - low frequency reporting (temperature/humidity/light/RGB) off|on
#  D[0|1] - Set light level low|high
#
# Outputs:
#  Xaccel.x,y,z,mag.x,y,z,compass
#  Ytemperature,pressure,light,r,g,b


import io
import os
import sys
import glob
import time
import errno
import ctypes
import select
import struct
import inspect
import threading
import traceback

from envirophat import light, weather, motion


files = [sys.stdin]
last_hf_time = time.time()
last_lf_time = time.time()

hf_interval = 0.5 # Approx 10/s
lf_interval = 1

hf_enabled = False
lf_enabled = False

scroll = None


def process_command(data):
  global hf_enabled, lf_enabled, hf_interval, lf_interval
  if data[0] == "M":
    if data[1] == '0':
      hf_enabled = False
    else:
      hf_enabled = True
  elif data[0] == "E":
    if data[1] == '0':
      lf_enabled = False
    else:
      lf_enabled = True
  elif data[0] == "I":
    if data[1] == 'M':
      hf_interval = float(data[2:len(data)])
    elif data[1] == 'E':
      lf_interval = float(data[2:len(data)])



def idle_work():
  global last_hf_time, last_lf_time
  now = time.time()
  if hf_enabled and (now-last_hf_time > hf_interval):
    mag = motion.magnetometer()
    accel = motion.accelerometer()
    h = motion.heading()
    print "M%0.10f,%0.10f,%0.10f,%d,%d,%d,%0.2f"%(accel.x,accel.y,accel.z,mag.x,mag.y,mag.z,h)
    last_hf_time = now
  if lf_enabled and (now-last_lf_time > lf_interval):
    rgb = light.rgb()
    t = round(weather.temperature(),2)
    p = round(weather.pressure(),2)
    c = light.light()
    r = rgb[0]
    g = rgb[1]
    b = rgb[2]
    print "E%0.2f,%0.2f,%d,%d,%d,%d"%(t,p,c,r,g,b)
    last_lf_time = now


def main_loop():
  # while still waiting for input on at least one file
  try:
    while files:
      ready = select.select(files, [], [], 0.01)[0]
      if not ready:
        idle_work()
      else:
        for file in ready:
          if file == sys.stdin:
            line = file.readline()
            if not line: # EOF, remove file from input list
              sys.exit(0)
            elif line.rstrip(): # optional: skipping empty lines
              process_command(line)
  except:
    sys.exit(traceback.format_exc())

try:
    main_loop()
except KeyboardInterrupt:
  pass
