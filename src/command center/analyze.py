#!/usr/bin/env python
# -*- coding:utf-8 -*-

import subprocess
import json
import os
import re
import ast
import pprint
import MySQLdb
import sys

'''class data stores important informations'''
class Data:
    user = None
    passwd = None
    database = None

    analyzeTool = None

# error -> only errors will be stored
# warning -> errors and warnings will be stored
logLevel = "warning"

'''method to analyze the top dir of stored www data'''
def analyzeRootUrlDir(dir_):
    readConfigFile()

    # analyze statFile
    rootInfo = analyzeStatFile(dir_ + "/stat.txt")

    # if no subdir is found. just ignore this directory
    if rootInfo is None:
        return

    # analyze subDirs
    subInfo = [] # firstDim = subInfo, secondDim = fileInfo
    for item in os.listdir(dir_):
        itemPath = dir_ + "/" + item
        if os.path.isdir(itemPath):
            si = analyzeSubUrlDir(itemPath)

            # append the analyzed info
            if si is not None:
                subInfo.append(si)

    # store internal
    rootInfo["subInfo"] = subInfo

    # remove the stored data and delete the empty directory
    try:
        os.remove(dir_+"/stat.txt")
        os.rmdir(dir_)
    except:
        pass

    # write stuff to database
    writeDatabase(rootInfo)

'''method to analyze the stat.txt file in the root dir'''
def analyzeStatFile(statFile):

    # open the stat file
    t = ""
    try:
        fr = open(statFile, "r")
        t = fr.read()
        fr.close()
    except Exception as e:
        print("ERROR: " + str(e))
        return

    # try to pass the stat file and store the infos
    j = None
    try:
        j = ast.literal_eval(t)
        j["pages"] = len(j["subUrls"]) + 1
        del j["subUrls"]
        #j = json.loads(t)
    except Exception as e:
        print t
        print("ERROR: " + str(e))
        return

    return j

'''method to analyze a subdir(a subpage of the www data)'''
def analyzeSubUrlDir(dir_):

    # iterate throu files and call analyzeFile for each
    fileInfos = []
    for item in os.listdir(dir_):
        itemPath = dir_ + "/" + item
        if os.path.isfile(itemPath):
            fi = analyzeFile(itemPath)

            # store the informations
            if fi is not None:
                fileInfos.append(fi)

    # delete the file after analyzing it
    try:
        os.rmdir(dir_)
    except:
        pass

    return fileInfos

'''method to analyze a a file in the subdir(subpage)'''
def analyzeFile(file_):

    # read in the file and try to parse it
    fr = open(file_, "r")
    t = fr.read()
    fr.close()

    try:
        j = json.loads(t)
    except Exception as e:
        print("ERROR: " + str(e))
        return

    # get the javascript body information and write it to a dummy file
    javascript = j["body"].encode('utf-8')
    dumpFile = file_ + "_dump"
    fw = open(dumpFile, "w")
    fw.write(javascript)
    fw.close()

    # analyze the dummy file
    fileInfo = analyzeJavascript(dumpFile)

    if fileInfo is None:
        return None

    # store the url informations
    fileInfo["url"] =  j["url"]
    fileInfo["originUrl"] =  j["originUrl"]
    fileInfo["rootUrl"] = j["rootUrl"]

    # get size in byte
    fileInfo["size"] = os.stat(dumpFile).st_size

    # delete created files and already analyzed files
    os.remove(dumpFile)
    try:
        os.remove(file_)
    except:
        pass

    return fileInfo

'''method to analyze javascript code'''
def analyzeJavascript(fileToScan):

    # call eslint or whatever in config is stored
    outputFile = fileToScan + "_output"
    cmd = Data.analyzeTool + " " + fileToScan + " > " + outputFile
    result = ""
    try:
        # call the config'ed analyze tool
        process = subprocess.Popen(['/bin/bash', '-c', cmd], stderr=subprocess.PIPE, stdout = subprocess.PIPE, stdin = subprocess.PIPE)
        process.wait()

        # get the output of the analyze tool
        f = open(outputFile, "r")
        result = f.read()
        f.close()

    except Exception as e:
        print("ERROR: " + str(e))
        return None

    # analyze result of the analyze tool
    jsInfo = {}
    jsInfo["counterError"] = 0
    jsInfo["counterWarning"] = 0
    jsInfo["file"] = fileToScan
    jsInfo["error"] = []
    jsInfo["warning"] = []
    for line in result.split("\n"):
        m = re.match("\s+([^\s]+)\s+([^\s]+)\s\s+(.+[^\s])\s\s+([^\s]*)\s*", line)
        if m is not None:
            linenmbr = m.group(1)
            level = m.group(2)
            message = m.group(3)
            ruleset = m.group(4)

            res = {}
            res["linenmbr"] = linenmbr
            res["level"] = level
            res["message"] = message
            res["ruleset"] = ruleset

            # handle ERROR output
            if level == "error" and (logLevel == "warning" or logLevel == "error"):
                jsInfo["counterError"] = jsInfo["counterError"] + 1
                jsInfo["error"].append(res)

            # handle WARNING output
            if level == "warning" and (logLevel == "warning"):
                jsInfo["counterWarning"] = jsInfo["counterWarning"] + 1
                jsInfo["warning"].append(res)

    # remove the output temp file
    os.remove(outputFile)

    return jsInfo


'''method writes given data to database'''
def writeDatabase(rootInfo):

    # connect with mysql database
    db = MySQLdb.connect(host="localhost",
            user=Data.user,
            passwd=Data.passwd,
            db=Data.database)
    cur = db.cursor()

    # some pre declared statements to insert into site an jfile
    stmtInsertSite = "INSERT INTO site\
        ( url, stime, etime, pages, finish, stuck, cntr, cntrAdv, cntrAdvDiff, cntrErr, cntrWarn )\
        VALUES ( %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s )"
    stmtInsertJfile = "INSERT INTO jfile\
        ( site_id, url, jfile, urlFound, cntrErr, cntrWarn, size )\
        VALUES ( %s, %s, %s, %s, %s, %s, %s )"

    # find all cntr Errors and Warning
    cntrErrAll = 0
    cntrWarnAll = 0
    for subInfo in rootInfo["subInfo"]:
        for subFile in subInfo:
            cntrErrAll = cntrErrAll + subFile["counterError"]
            cntrWarnAll = cntrWarnAll + subFile["counterWarning"]

    # insert new site into table site
    cur.execute(stmtInsertSite, ( \
        str(rootInfo["url"]),
        str(int(rootInfo["startTime"])),\
        str(int(rootInfo["endTime"])),\
        str(int(rootInfo["urlsCount"])),\
        str(int(rootInfo["urlsFinish"])),\
        str(int(rootInfo["urlsStuck"])),\
        str(rootInfo["cntr"]),\
        str(rootInfo["cntrAdv"]),\
        str(rootInfo["cntrAdvDiff"]),\
        str(cntrErrAll),\
        str(cntrWarnAll)\
    ))
    site_id = cur.lastrowid

    # insert file info in jfile table
    for subInfo in rootInfo["subInfo"]:
        for subFile in subInfo:

            cur.execute(stmtInsertJfile, (\
                str(site_id),\
                str(subFile["url"]),\
                str(subFile["file"]),\
                str(subFile["originUrl"]),\
                str(subFile["counterError"]),\
                str(subFile["counterWarning"]),\
                str(subFile["size"])\
            ))
            jfile_id = cur.lastrowid

            for errorResult in subFile["error"]:
                # insert error result to database
                checkResult(cur, errorResult, jfile_id, site_id)

            for warningResult in subFile["warning"]:
                # insert warning result to database
                checkResult(cur, warningResult, jfile_id, site_id)

    db.commit()
    db.close()

'''this method writes the result to the database'''
def checkResult(cur, result, jfile_id, site_id):
    linenmbr = result["linenmbr"]
    message = result["message"]
    ruleset = result["ruleset"]
    level = result["level"]

    # check if Message is already in table message
    message_id = checkMessage(cur, message, ruleset, level)
    if message_id is None:
        message_id = insertMessage(cur, message, ruleset, level)

    # insert result to database
    stmtInsertResult = "INSERT INTO result\
        ( jfile_id, site_id, message_id, linenmbr )\
        VALUES ( %s, %s, %s, %s )"

    cur.execute(stmtInsertResult, ( str(jfile_id), str(site_id),\
        str(message_id), str(linenmbr)))

'''checks for a given message if its already in db'''
def checkMessage(cur, message, ruleset, level):
    cur.execute("SELECT id from message WHERE\
            message = %s AND\
            ruleset = %s AND\
            level = %s", (message, ruleset, level))
    data = cur.fetchall()
    if len(data) > 0:
        return data[0][0]
    return None

'''inserts new message to database'''
def insertMessage(cur, message, ruleset, level):
    cur.execute("INSERT INTO message (message, ruleset, level)\
            VALUES ( %s, %s, %s )", (message, ruleset, level))
    return cur.lastrowid

'''called initally to create database'''
def createDatabase():
    readConfigFile()

    db = MySQLdb.connect(host="localhost",
            user=Data.user,
            passwd=Data.passwd,
            db=Data.database)
    cur = db.cursor()

    # drop everything first?
    try:
        cur.execute("DROP TABLE site;")
    except:
        pass
    try:
        cur.execute("DROP TABLE jfile;")
    except:
        pass
    try:
        cur.execute("DROP TABLE message;")
    except:
        pass
    try:
        cur.execute("DROP TABLE result;")
    except:
        pass

    createSite = "CREATE TABLE site (\
            id          INT             UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
            url         VARCHAR(255)    NOT NULL,\
            stime       INT,\
            etime       INT,\
            pages       INT,\
            finish      INT,\
            stuck       INT,\
            cntr        INT,\
            cntrAdv     INT,\
            cntrAdvDiff INT,\
            cntrErr     INT,\
            cntrWarn    INT\
            )"
    createFile = "CREATE TABLE jfile (\
            id          INT             UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
            site_id     INT             REFERENCES site(id),\
            url         VARCHAR(255),\
            jfile       VARCHAR(255),\
            urlFound    VARCHAR(255),\
            cntrErr     INT,\
            cntrWarn    INT,\
            size        INT\
            )"
    createResult = "CREATE TABLE result (\
            id          INT             UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
            jfile_id    INT REFERENCES jfile(id),\
            site_id     INT REFERENCES site(id),\
            message_id  INT REFERENCES message(id),\
            linenmbr    VARCHAR(255)\
            )"
    createMessage = "CREATE TABLE message (\
            id          INT             UNSIGNED AUTO_INCREMENT PRIMARY KEY,\
            message     VARCHAR(255),\
            ruleset     VARCHAR(255),\
            level       VARCHAR(255)\
            )"

    try:
        cur.execute(createSite)
    except:
        pass
    try:
        cur.execute(createFile)
    except:
        pass
    try:
        cur.execute(createMessage)
    except:
        pass
    try:
        cur.execute(createResult)
    except:
        pass

    db.commit()
    db.close()

''' read the configs'''
def readConfigFile():
    configFile = open("./analyze.config", "r")
    config = json.loads(configFile.read())
    Data.user = config["username"]
    Data.passwd = config["password"]
    Data.database = config["database"]
    Data.analyzeTool = config["analyzeTool"]
    configFile.close()


def main(path):
    analyzeRootUrlDir(path)

''' gets called with a given root Dir as argv 1'''
if __name__ == "__main__":
    if len(sys.argv) > 1:
        main(sys.argv[1])
