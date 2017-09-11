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
import requests
import subprocess

import analyze

from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import SocketServer

class Data:
    sites = Queue.Queue()
    urlsInfo = {}
    urlsCount = 0
    rules = None

    output_directory = "./out/"
    log_directory = "./log/"
    log_file = "log.txt"
    timeout = 60*60

    rules_file = "./easylistgermany+easylist.txt"
    url_file = "./top-1m.txt"

    portMessage = 8082
    ip = "localhost"

    oldRootUrls = []

class Helper:

    @staticmethod
    def encode(url):
        m = hashlib.md5()
        m.update(url.replace("/", "").replace(" ", ""))
        return m.hexdigest()

    @staticmethod
    def getMd5(msg):
        m = hashlib.md5()
        m.update(msg)
        return m.hexdigest()

    @staticmethod
    def writeLog(logstring):
        if not os.path.isdir(Data.log_directory):
            os.mkdir(Data.log_directory)

        f = open(Data.log_directory + "/" + Data.log_file, "a")
        f.write(logstring)
        f.close()

    @staticmethod
    def makeRootDir(rootUrl):
        rootDir = Data.output_directory + Helper.encode(rootUrl)
        if not os.path.isdir(rootDir):
            os.mkdir(rootDir)

        return rootDir

    @staticmethod
    def makeSubDir(rootDir, originUrl):
        subDir = rootDir + "/" + Helper.encode(originUrl)
        if not os.path.isdir(subDir):
            os.mkdir(subDir)

        return subDir

    @staticmethod
    def initializeUrlInfo(site):
        if site in Data.oldRootUrls:
            return False

        date = time.time()

        # start URL crawling
        # reset info
        Data.urlsInfo[site] = {}

        Data.urlsInfo[site]["cntr"] = 0
        Data.urlsInfo[site]["cntrAdv"] = 0
        Data.urlsInfo[site]["cntrAdvDiff"] = 0
        Data.urlsInfo[site]["subUrls"] = []
        Data.urlsInfo[site]["url"] = site
        Data.urlsInfo[site]["startTime"] = time.time()
        Data.urlsInfo[site]["lastModified"] = time.time()
        Data.urlsInfo[site]["urlsCount"] = 1
        Data.urlsInfo[site]["urlsFinish"] = 0
        Data.urlsInfo[site]["urlsStuck"] = 0
        # reset md5 info
        Data.urlsInfo[site]["advMd5"] = []

        Data.urlsInfo[site]["analyze"] = False;

        rootDir = Helper.makeRootDir(site)

        message = "start " + site
        logstring = "[" + str(date) + "][STAT]: " + str(message) + "\n"

        print(logstring[:-1])

        Data.oldRootUrls.append(site)
        return True

    @staticmethod
    def printStatus():
        keys = Data.urlsInfo.keys()
        print("COunter: " + str(len(keys)))
        for site in keys:
            urlInfo = Data.urlsInfo[site]
            print("Url: " + str(urlInfo["url"]) +\
                ", " + str(urlInfo["urlsFinish"]) + "/" + str(urlInfo["urlsCount"]) +\
                ", stuck: " + str(urlInfo["urlsStuck"]) +\
                ", 3rdParty: " + str(urlInfo["cntr"]) +\
                ", Adv: " + str(urlInfo["cntrAdv"]) + \
                ", AdvDiff: " + str(urlInfo["cntrAdvDiff"]))
        print("Workerqueue: " + str(Worker.q.qsize()) + " is full: " +\
                 str(Worker.q.full())) 
        print("COunter: " + str(len(keys)))


class Worker:

    q = Queue.Queue()

    def worker(self):
        while True:
            content = Worker.q.get()
            Worker.q.task_done()


            try:
                content = json.loads(content)
            except Exception as e:
                Helper.writeLog("ERR: "+str(e)+"\n") 
                continue

            try:
                if content["command"] == "log":
                    self.workOnLog(content)
                if content["command"] == "result":
                    self.workOnResult(content)
                if content["command"] == "suburls":
                    self.workOnSuburls(content)
                if content["command"] == "tab":
                    self.workOnTabComplete(content)
                if content["command"] == "analyze":
                    self.workOnAnalyzeCheck(content)
                    self.checkTimeout()
            except Exception as e:
                Helper.writeLog("\r\nERR: " + str(e) +" - " + str(e.message) + "\r\n")

            # check if finished

    def workOnLog(self, content):
        message = content["message"]
        date = content["date"]

        logstring = "[" + str(date) + "]: " + str(message) + "\n"
        Helper.writeLog(logstring)

    def workOnResult(self, content):

        site = content["rootUrl"]

        if not site in Data.urlsInfo:
            if not Helper.initializeUrlInfo(site):
                Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
                return

        urlInfo = Data.urlsInfo[site]

        urlInfo["cntr"] = urlInfo["cntr"] + 1
        urlInfo["lastModified"] = time.time()

        url = content["url"]
        originUrl = content["originUrl"]
        rootUrl = content["rootUrl"]
        body = content["body"].encode('utf-8')
        date = content["date"]

        # check if advertisment
        if not Data.rules.should_block(url):
            return

        urlInfo["cntrAdv"] = urlInfo["cntrAdv"] + 1

        # check if already existed in this rootUrl
        bodyMd5 = Helper.getMd5(body)
        if bodyMd5 in urlInfo["advMd5"]:
            return

        urlInfo["cntrAdvDiff"] = urlInfo["cntrAdvDiff"] + 1

        urlInfo["advMd5"].append(bodyMd5)

        rootDir = Helper.makeRootDir(urlInfo["url"])
        subDir = Helper.makeSubDir(rootDir, originUrl)

        # write data to file
        f = open(subDir + "/" + Helper.encode(url) + ".txt", "w")
        f.write(json.dumps(content))
        f.close()

    def workOnSuburls(self, content):
        #subUrls = json.loads(json.dumps(content["suburls"]))
        #site = content["rootUrl"]

        #if not site in Data.urlsInfo:
        #    Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
        #    return False

        #urlInfo = Data.urlsInfo[site]

        #for subUrl in subUrls:
        #    urlInfo["subUrls"].append(subUrl)
        #urlInfo["urlsCount"] = urlInfo["urlsCount"] + len(subUrls)

        site = content["rootUrl"]

        if not site in Data.urlsInfo:
            if not Helper.initializeUrlInfo(site):
                Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
                return
	
	Helper.writeLog("Found new suburls: ")

        subUrls = content["suburlsCntr"]

	Helper.writeLog(str(subUrls))


	Helper.writeLog("on site: " + str(site) + "\n")

        urlInfo = Data.urlsInfo[site]
        #Helper.writeLog("GOT HERE with " + str(subUrls) + " from " + site)
        urlInfo["urlsCount"] = urlInfo["urlsCount"] + int(subUrls)

        urlInfo["lastModified"] = time.time()

        if urlInfo["urlsStuck"] + urlInfo["urlsFinish"] >= urlInfo["urlsCount"]:
            if urlInfo["analyze"]:
                self.workOnAnalyze(site)

    def workOnTabComplete(self, content):
        site = content["rootUrl"]

        if not site in Data.urlsInfo:
            if not Helper.initializeUrlInfo(site):
                Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
                return

        urlInfo = Data.urlsInfo[site]

	Helper.writeLog("TAB COMPLETE on site: " + str(site) + " with " + str(content["stat"])+ "\n")

        if content["stat"] == "finish":
            urlInfo["urlsFinish"] = urlInfo["urlsFinish"] + 1
            urlInfo["lastModified"] = time.time()
        if content["stat"] == "stuck":
            urlInfo["urlsStuck"] = urlInfo["urlsStuck"] + 1
            urlInfo["lastModified"] = time.time()

        if urlInfo["urlsStuck"] + urlInfo["urlsFinish"] >= urlInfo["urlsCount"]:
            if urlInfo["analyze"]:
                self.workOnAnalyze(site)


    def workOnAnalyzeCheck(self, content):

        site = content["rootUrl"]

        if not site in Data.urlsInfo:
            if not Helper.initializeUrlInfo(site):
                Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
                return

	Helper.writeLog("Found new analyze check: ")


	Helper.writeLog("on site: " + str(site) + "\n")


        urlInfo = Data.urlsInfo[site]

        urlInfo["analyze"] = True;

        if urlInfo["urlsStuck"] + urlInfo["urlsFinish"] >= urlInfo["urlsCount"]:
            self.workOnAnalyze(site)

    def workOnAnalyze(self, site):

        if not site in Data.urlsInfo:
            if not Helper.initializeUrlInfo(site):
                Helper.writeLog("ERR: Url " +site+ " not found in Data\n");
                return

        urlInfo = Data.urlsInfo[site]

        Helper.printStatus()
        print("Starting analyze Thread")

        rootDir = Helper.makeRootDir(site)

        urlInfo["endTime"] = time.time()

        date = time.time()

        f = open(rootDir + "/" + "stat.txt", "w")
        message = "finish " + urlInfo["url"]
        logstring = "[" + str(date) + "][STAT]: " + str(message) + "\n"

        print(logstring[:-1])

        f.write(str(urlInfo))
        f.close()

        #t = threading.Thread(target=analyze.analyzeRootUrlDir, args=(rootDir,))
        #t.daemon = True
        #t.start()

        del Data.urlsInfo[site]

        #cmd=["bash", "/home/cip/2010/qy56maze/ma/src/test/VS_sendFilesToServer.sh", rootDir]
        cmd=["bash", "echo", "CHANGEME_do_something_with_files_in_" + rootDir]
        process = subprocess.Popen(cmd)


    def checkTimeout(self):
        keys = Data.urlsInfo.keys()
        for site in keys:
            lm = Data.urlsInfo[site]["lastModified"]
            now = time.time()
            if int(now) - int(lm) > Data.timeout:
                urlInfo = Data.urlsInfo[site]
                Helper.writeLog("TIMEOUT: waited too long: " +\
                    "Url: " + str(urlInfo["url"]) +\
                    ", " + str(urlInfo["urlsFinish"]) + "/" + str(urlInfo["urlsCount"]) +\
                    ", stuck: " + str(urlInfo["urlsStuck"]) +\
                    ", 3rdParty: " + str(urlInfo["cntr"]) +\
                    ", Adv: " + str(urlInfo["cntrAdv"]) + \
                    ", AdvDiff: " + str(urlInfo["cntrAdvDiff"]))
                self.workOnAnalyze(site)


class S2(BaseHTTPRequestHandler):



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

            self.sendMsg("{ \"queued\" : \"true\" }")

            self.finish()
            self.connection.close()

            Worker.q.put(post_data)

        except:
            Helper.writeLog("ERR happend, broken pipe\n");

    def log_message(self, format, *args):
        return


# INITIALIZE
# reading config file
print("Reading Config file commandCenter.config")
configFile = open("./commandCenter.config", "r")
config = json.loads(configFile.read())
Data.output_directory = config["output_directory"]
Data.log_directory = config["log_directory"]
Data.log_file = config["log_file"]
Data.timeout = int(config["timeout"])
Data.rules_file = config["rules_file"]
Data.url_file = config["url_file"]
Data.portMessage = int(config["portMessage"])
Data.ip = config["ip"]


print("Reading AdblockRule Textfile")
f = open(Data.rules_file, "r")
raw = f.read().split("\n")
raw_rules = []
for r in raw:
    raw_rules.append(r)
f.close()
print("Generating AdblockRules")
Data.rules = adblockparser.AdblockRules(raw_rules)

print("Generating Database")
#analyze.createDatabase();


print("Reading Urllist Textfile")
f = open(Data.url_file, "r");
li = f.read()
f.close()
li = li.split("\n");

counter=int(random.random()*100000)
counter = 0

#counter=1000
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

print("Starting Workerthreads")
work = Worker()
t = threading.Thread(target=work.worker)
t.daemon = True
t.start()

server_address2 = ('', Data.portMessage)
httpd2 = HTTPServer(server_address2, S2)

t3 = threading.Thread(target=httpd2.serve_forever)
t3.daemon = True
t3.start()

print("Started Result Handler on port: " + str(Data.portMessage))

while True:
    sys.stdin.readline()
