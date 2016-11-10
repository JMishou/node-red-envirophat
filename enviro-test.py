#! /usr/bin/python

# Commands:
#  X[0|1] - high frequency reporting (accel/magnetometer/compass) off|on
#  Y[0|1] - low frequency reporting (temperature/humidity/pressure) off|on
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

from envirophat import light, weather, motion

EVENT_FORMAT = 'llHHI'
EVENT_SIZE = struct.calcsize(EVENT_FORMAT)
EVENT_NAMES = {103:'U',105:'L',106:'R',108:'D',28:'E'}




file_ = sys.stdin
last_hf_time = time.time()
last_lf_time = time.time()

hf_interval = 0.09 # Approx 10/s
lf_interval = 1

hf_enabled = False
lf_enabled = False

scroll = None


def process_command(data):
  global hf_enabled, lf_enabled

  if data[0] == "X":
    if data[1] == '0':
      hf_enabled = False
    else:
      hf_enabled = True
  elif data[0] == "Y":
    if data[1] == '0':
      lf_enabled = False
    else:
      lf_enabled = True



def idle_work():
  global last_hf_time, last_lf_time
  now = time.time()
  if hf_enabled and (now-last_hf_time > hf_interval):
    mag = motion.magnetometer()
    accel = motion.accelerometer()
    h = motion.heading()
    print "X%0.10f,%0.10f,%0.10f,%d,%d,%0d,%0.2f".format(accel.x,accel.y,accel.z,mag.x,mag.y,mag.z,h)
    last_hf_time = now
  if lf_enabled and (now-last_lf_time > lf_interval):
    t = round(weather.temperature(),2)
    p = round(weather.pressure(),2)
    c = light.light()
    r = rgb[0]
    g = rgb[1]
    b = rgb[2]
    print "Y%0.2f,%0.2f,%d,%d,%d,,%d".format(t,p,c,r,g,b)
    last_lf_time = now


def main_loop():
  # while still waiting for input on at least one file
  try:
    while file_:
      ready = select.select(file_, [], [], 0.01)[0]
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
    sys.exit(0)

try:
    main_loop()
except KeyboardInterrupt:
  pass
