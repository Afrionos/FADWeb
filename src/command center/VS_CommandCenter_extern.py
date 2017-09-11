#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function
import socket
import sys
import json
import os
import asyncore
import time
import Queue
import threading
import hashlib
import adblockparser
import random
import re

import analyze

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import SocketServer

class Data:
    url_file = ""
    sites = Queue.Queue()
    portRequest = 8082
    i = 0

class S(BaseHTTPRequestHandler):

    def checkAndQueueMessage(self, inputMsg):
        try:
            content = json.loads(inputMsg)
        except Exception as e:
            # this is for filtering keep alives
            print("ERR: "+str(e)+"\n"+str(inputMsg)+"\n") 
            return False

        # split between requests that needed response and only stores
        if content["command"] == "newroot":
            self.checkNewRootMessage()
        else:
            self.sendMsg("{ \"queued\" : \"true\" }")
        return True

    def checkNewRootMessage(self):

        if Data.sites.empty():
            return

        site = Data.sites.get()
        Data.i = Data.i + 1
        print(str(Data.i) + ": { \"rootUrl\" : \"http://"+site+"\" }")

        # send new Root URL
        self.sendMsg("{ \"rootUrl\" : \"http://"+site+"\" }")


    def sendMsg(self, msg):
        try:
            self._set_headers()
            self.wfile.write(msg)
        except:
            pass


    def _set_headers(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Connection', 'close')
        self.end_headers()

    def do_GET(self):
        pass

    def do_HEAD(self):
        self._set_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length']) # <--- Gets
            post_data = self.rfile.read(content_length) # <--- Gets

            self.checkAndQueueMessage(post_data)

            self.finish()
            self.connection.close()
        except:
            print("ERR happend, broken pipe\n");

    def log_message(self, format, *args):
        return


# INITIALIZE
# reading config file
print("Reading Config file commandCenter.config")
configFile = open("./commandCenter.config", "r")
config = json.loads(configFile.read())
Data.url_file = config["url_file"]


print("Reading Urllist Textfile")
f = open(Data.url_file, "r");
li = f.read()
f.close()
li = li.split("\n");

counter=int(random.random()*100000)
counter = 0

for l in li:

    if counter > 0:
        counter = counter - 1
        continue

    #if cntr < 0:
    #    break

    if l[0:1] != "#":
        Data.sites.put(l)
        #cntr = cntr - 1

print("Waiting for incoming connections from crawler")

# start rootURL handler
server_address = ('', Data.portRequest)
httpd = HTTPServer(server_address, S)
httpd.serve_forever()
