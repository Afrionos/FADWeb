///<reference path="chrome-api-vsdoc.js"/>
///<reference path="jquery-1.10.2-vsdoc.js"/>
///<reference path="adblock_filter.js"/>

var MAXDEPTH = 1;
var ANZTABS = 4;
var COMMAND_IP= "http://localhost";
var COMMAND_PORT = 8082;
var RESULT_IP= "http://localhost";
var RESULT_PORT = 8083;
var RUNNING = "stopped";
var TABTIMEOUT = 10;

// urlQueues = { "tab.id" : { "q" : [], "oq" : [] }
var urlQueues={}

//var urlInfo = { url: url, rootUrl: rootUrl, depth: depth, loadTime: undefined };
var tabIds = [];
var tabInfo = {};

var tmpCntr = 0;

var tabStatus = {};

// ========================================================
// TABS HANDLING
// ========================================================
function createTab(){
	chrome.tabs.create({ },
		function(tab){
			tabIds.push(tab.id);
			tabInfo[tab.id] = undefined;
			tabStatus[tab.id] = {}
			tabStatus[tab.id]["status"] = "undefined";
			urlQueues[tab.id] = {}
			urlQueues[tab.id]["q"] = []
			urlQueues[tab.id]["oq"] = []
			//urlQueues[tab.id]["result"] = []
			log("Tab created with tabId " + tab.id);
			loadNextUrlToTab(tab.id);
		}
	);
}
function createTabRoot(){
	chrome.tabs.create({ },
		function(tab){
			tabIds.push(tab.id);
			tabInfo[tab.id] = undefined;
			tabStatus[tab.id] = {}
			tabStatus[tab.id]["requestTime"] = Date.now();
			tabStatus[tab.id]["status"] = "requested";
			urlQueues[tab.id] = {}
			urlQueues[tab.id]["q"] = []
			urlQueues[tab.id]["oq"] = []
			//urlQueues[tab.id]["result"] = []
			log("Tab created with tabId " + tab.id);

			requestNewRootUrl(tab.id);
		}
	);
}
function createTabStuck(tabId, rootUrl){
	chrome.tabs.create({ },
		function(tab){
			tabIds.push(tab.id);
			tabInfo[tab.id] = { rootUrl: rootUrl };

			tabStatus[tab.id] = {}
			tabStatus[tab.id]["status"] = "undefined";

			//urlQueues[tab.id] = urlQueues[tabId];

			// copy existing values
			urlQueues[tab.id] = {}
			urlQueues[tab.id]["q"] = []
			urlQueues[tab.id]["oq"] = []

			var i = urlQueues[tabId]["q"].length;
			for(var j = 0; j < i; j++){
				urlQueues[tab.id]["q"][j] = urlQueues[tabId]["q"][j]
			}
			var k = urlQueues[tabId]["oq"].length;
			for(var j = 0; j < k; j++){
				urlQueues[tab.id]["oq"][j] = urlQueues[tabId]["oq"][j]
			}
			//urlQueues[tab.id]["q"] = urlQueues[tabId]["q"].slice();
			//urlQueues[tab.id]["oq"] = urlQueues[tabId]["oq"].slice();

			//delete(urlQueues[tabId]);
			log("Tab with id " + tabId + " stuck. Creating new Tab: " + tab.id + " copied " + j + " urls");

			loadNextUrlToTab(tab.id);
		}
	);
}

function shouldCrawl(urlInfo, tabId){
	for(var i = 0; i < urlQueues[tabId]["oq"].length; i++){
		if(urlQueues[tabId]["oq"][i].url === urlInfo.url){
			return false;
		}
	}
	return true;
}

function loadNextUrlToTab(tabId){
	if(RUNNING != "running"){
		return false;
	}

	var urlInfo = urlQueues[tabId]["q"].shift();

	if(urlInfo == undefined){

		if(tabStatus[tabId]["status"] == "requested" || tabStatus[tabId]["status"] == "loading"){
			return
		}
		tabStatus[tabId]["requestTime"] = Date.now();
		tabStatus[tabId]["status"] == "requested";

		if(tabInfo[tabId] != undefined){
			//sendResult(tabId);
			sendAnalyse(tabInfo[tabId].rootUrl);
		}

		log("Tab " + tabId + " reporting: UrlQueue is empty");
		// free the space
		//delete(tabInfo[tabId]);

		//urlQueues[tabId] = {}
		//urlQueues[tabId]["q"] = []
		//urlQueues[tabId]["oq"] = []
		//urlQueues[tabId]["result"] = []
		

		//chrome.tabs.remove(tabId, function(){});

		//var i = tabIds.indexOf(tabId);
		//tabIds.splice(i, 1);

		//`createTabRoot();
		urlQueues[tabId] = {}
		urlQueues[tabId]["q"] = []
		urlQueues[tabId]["oq"] = []
		
		requestNewRootUrl(tabId);


		return false;
	}

	tabStatus[tabId]["status"] == "loading";
	urlQueues[tabId]["oq"].push(urlInfo);

	var urlToLoad = urlInfo.url;
	var depth = urlInfo.depth;

	log("Loading " + urlToLoad + " in Tab " + tabId + " from rootUrl: " + urlInfo.rootUrl);

	urlInfo.loadTime = Date.now();
	//tabStatus[tabId]["requestTime"] = Date.now();

	chrome.tabs.update(tabId, { url:urlToLoad });
	tabInfo[tabId] = urlInfo;//{ url:urlToLoad, depth:depth };
}

// this function checks wether a tab is stuck in loading or is dead
// in both cases the tab will be closed and a new one will be opend
// if all tabs are without work, a new rootURL will be requested.
function checkTabs(){
	if(RUNNING != "running"){
		log("it is not running");
		return false;
	}

	var content = {};
	var now = new Date();
   	content.date = now.toLocaleString();
   	content.command = "log";
   	content.message = "INFO TABIDS: " + tabIds + "__" + tabStatus;
   	sendCC(content);


	var deleteTabIds = [];
	var urlToDelete = {};
	for(var i = 0; i < tabIds.length; i++){
		var tabId = tabIds[i];

		// check if tab is in timeout. renew Tab
        if (
			(tabStatus[tabId]["status"] == "requested" && tabStatus[tabId]["requestTime"] + (TABTIMEOUT * 1000) < Date.now()) ||
			(tabInfo[tabId] != undefined && Date.now() > (tabInfo[tabId].loadTime + (TABTIMEOUT * 1000)))){

			// just for debug propose, FIXME DELETEME
			if(tabStatus[tabId]["status"] == "requested" && tabStatus[tabId]["requestTime"] + (TABTIMEOUT * 1000) < Date.now()){

				console.log("sh1t happens");

				tabInfo[tabId].rootUrl = undefined;

			}

			log("STUCK: Tab with ID " + tabId + "is stuck! Stopping it!");
			sendComplete(tabInfo[tabId], "stuck");
			//tabInfo["status"] = "stuck";

			//sendAnalyse(tabInfo[tabId]);
			tabStatus[tabId]["status"] == "complete";

			deleteTabIds.push(tabId);
			urlToDelete[tabId] = tabInfo[tabId].rootUrl;

			delete(tabInfo[tabId]);
			tabIds.splice(i, 1);
			i = i - 1

		}

	}

	// remove tabs
	for(var i = 0; i < deleteTabIds.length; i++){
		var tabId = deleteTabIds[i];

		// remove Tab
		chrome.tabs.remove(tabId, function(){});
	}

	// create tabs
	for(var i = 0; i < deleteTabIds.length; i++){
		var tabId = deleteTabIds[i];
		createTabStuck(tabId, urlToDelete[tabId]);
	}
}


function init(){
	// EINRICHTUNG
	for(var i = 0; i < ANZTABS; i++){
		createTabRoot();
	}
}

var initCntr = 0;
var intervalRefId=setInterval(startAndInit, 2000);
function startAndInit(){
	console.log("foobar");
	if(initCntr == 0){
		init();
	}
	if(initCntr == 1){
		clearHistoryAndStart();
	}
	if(initCntr >= 1){
		setInterval(checkTabs, 5*1000);
		clearInterval(intervalRefId);
	}
	initCntr = initCntr + 1;
}

function stop(){
	RUNNING = "stopped";
}

function start(){
	RUNNING = "running";
	log("Crawling started");
	for(var i = 0; i < tabIds.length; i++){
		loadNextUrlToTab(tabIds[i]);
	}

}


function insertUrlQueue(rootUrl, url, depth, tabId){
	if(rootUrl == undefined){
		rootUrl = url;
	}
	var urlInfo = { url: url, rootUrl: rootUrl, depth: depth, loadTime: undefined };
	if(!shouldCrawl(urlInfo, tabId)){
		return false;
	}
	urlQueues[tabId]["q"].push(urlInfo);
	return true;
	log("New Url inserted: " + url + " with rootUrl: " + rootUrl );
}

// inserting a new rootUrl in the queue. Afterwards the crawling will be
// the oldUrl Queue will be deleted. no need to keep the old data
function insertRootUrlQueue(url, tabId){
	// empty old url queue
	//urlQueues[tabId]["oq"] = [];
	tmpCntr = 0;

	// insert root url
	insertUrlQueue(url, url, 0, tabId);
	log("New Root Url inserted: " + url);

	loadNextUrlToTab(tabId);
}

function crawlUrls(originUrl, originDepth, rootUrl, tabId, newUrls){
	if(newUrls == undefined){
		//sendAnalyse(tabInfo[tabId]);
		tabInfo["status"] = "undefined";
		loadNextUrlToTab(tabId);
		return;
	}

	var filteredUrls = convertAndFilterLinks(originUrl, originDepth, rootUrl, tabId, newUrls);

	var j = 0;
	var sendSubUrls = []
	for(var i = 0; i < filteredUrls.length; i++){
		var newUrl = filteredUrls[i];
		if(insertUrlQueue(rootUrl, newUrl, originDepth+1, tabId) == true){
			sendSubUrls.push(newUrl);
			j++;
		}
	}
	log("New suburls inserted: " + j + " suburls from " + originUrl + "(" + rootUrl + ")");

	var content = {}
	content.command = "suburls"
	//content.suburls = sendSubUrls
	content.suburlsCntr = sendSubUrls.length;
	content.originUrl = originUrl
	content.rootUrl = rootUrl

	sendCC(content)

	if(j == 0){
		//sendAnalyse(tabInfo[tabId]);
		tabInfo[tabId]["status"] = "analysecuznosuburls";
	} else {
		tabInfo[tabId]["status"] = "finishwithoutanalyse";
	}

	tabStatus[tabId]["status"] = "complete";
	loadNextUrlToTab(tabId);
}

// if a tab has finished loading, give him a new URL and get his DOM Links
function tabFinished(tabId, changeInfo, tab){
	if (changeInfo.status == 'complete') {

		if(!tabInfo.hasOwnProperty(tabId)) return;
		if(tabInfo[tabId] == undefined) return;

		//if(tabInfo["status"]

		log("FIN: Tab " + tabId + " finished loading: " + tabInfo[tabId].rootUrl);
		sendComplete(tabInfo[tabId], "finish");
		tabInfo[tabId]["status"] = "finish";

		//log("FIN: Tab " + tabId + " finished loading");

		var originUrl = tabInfo[tabId].url;
		var originDepth = tabInfo[tabId].depth;
		var rootUrl = tabInfo[tabId].rootUrl;
		if(originDepth >= MAXDEPTH){
			log("MAXDEPTH: Tab " + tabId + " with url " + originUrl + " has gone to MAXDEPTH");
			//sendAnalyse(tabInfo[tabId]);
			tabInfo["status"] = "analyse";
			tabStatus[tab.id]["status"] = "complete";
			loadNextUrlToTab(tabId);
		} else {
			var message = {};
			message.command = "collectLinks";
			log("Collecting new Urls from tab " + tabId + " from url: " + originUrl);
			chrome.tabs.sendMessage(tabId, message, function(response){
				log("Received new Urls from tab " + tabId);
				crawlUrls(originUrl, originDepth, rootUrl, tabId, response);
			});
		}

	}
}

// ========================================================
// REQUEST HANDLING
// ========================================================
function getDomainFromUrl(url)
{
	if (typeof url != "string")
	{
		return url;
	}

	// get host, if there is a slash -> cut paths off
	var base = url;
	if (url.indexOf("/", 9) != -1)
	{
		base = url.substring(0, url.indexOf("/", 9)); // look for a dash after position 8 (after https://)
	}

	// remove everything before www.
	if (base.indexOf("www.") != -1)
	{
		base = base.substring(base.indexOf("www") + 4);
	}
		// remove http://
	else if (base.indexOf("http://") != -1)
	{
		base = base.substring(base.indexOf("http://") + 7);
	}
		// remove https://
	else if (base.indexOf("https://") != -1)
	{
		base = base.substring(base.indexOf("https://") + 8);
	}
	else
	{
		return url;
	}

	// subdomains remain! www1. remains as well

	return base;
}

function getContent(url, infoTab, callback){
	var xmlRequest=new XMLHttpRequest();
	xmlRequest.open('GET',url,true);
	xmlRequest.send();

	//xmlRequest.onreadystatechange=function(){
	xmlRequest.onload=function(){
		if(xmlRequest.readyState==4){
			var content = {};

			content.body = xmlRequest.responseText;


			content.url = url;
			content.originUrl = infoTab.url;
			content.rootUrl = infoTab.rootUrl;

			var now = new Date();
			content.date = now.toLocaleString();

			callback(content);
		}
	};
}

function isThirdParty(originUrl, requestUrl){
	if(getDomainFromUrl(originUrl) !== getDomainFromUrl(requestUrl))
		return "thirdparty";
	else
		return "~thirdparty";
}
function isScript(url){
	var arr = url.split(".");
	var ext = arr[arr.length - 1];
	if(ext == "js")
		return "script";
	else
		return "~script";
}
/**
* This function checks for download links and returns false if one is found
*/
function isUrlDownloadLink(url)
{
        if (typeof url != "string")
        {
                logToServer("Parameter is no string! Can't check url if it is a download link.", "ERROR");
                return true;    // return true, so it will be filtered out
        }

        // remove downloads  (movies)
        if (url.match(/(\.aiff|\.asf|\.avi|\.dif|\.ra?m|\.divx|\.mov|\.movie|\.mp3|\.mp4|\.mpe?g|\.mpv2|\.ogg\.snd|\.qt|\.wav|\.wmf|\.wma|\.wmv)$/) != null)
        {
                return true;
        }
        // remove pictures and docs
        else if (url.match(/(\.gif|\.jpe?g|\.png|\.tiff|\.css|\.js|\.pdf|\.docx?|\.xlsx?|\.xslt?|\.xs|\.xslm|\.xml|\.docx?|\.txt|\.java|\.cpp|\.c|\.h|\.vcf|\.pptx?)$/) != null) {
                return true;
        }
        // remove archives and images
        else if (url.match(/(\.7|\.bin|\.bz2|\.cab|\.cdr|\.dmg|\.gz|\.hqx|\.iso|\.rar|\.smi|\.sit|\.sea|\.tar|\.tgz|\.zip)$/) != null)
        {
                return true;
        }
        // remove 
        else if (url.match(/(\.ade|\.adp|\.asx|\.bas|\.bat|\.chm|\.com|\.cmd|\.cpl|\.crt|\.dat|\.dll|\.eml|\.exe|\.hiv|\.hlp|\.hta|\.inc|\.inf|\.ins|\.isp|\.jse|\.jtd|\.lnk|\.msc|\.msh|\.msi|\.msp|\.mst|\.nws|\.ocx|\.oft|\.ops|\.pcd|\.pif|\.plx|\.reg|\.scr|\.sct|\.sha|\.shb|\.shm|\.shs|\.sys|\.tlb|\.torrent|\.tsp|\.url|\.vbe|\.vbs|\.vxd|\.wsc|\.wsf|\.wsh)$/) != null)
        {
                return true;
        }

        return false;
}

var duplicateUrls = [];

// Get all outgoing request before they are done. Send your own
// request using getcontent()
function beforeRequest(details){


	if(details == undefined)
		return;

	// get own infos, tabId and originURL
	var tabId = details.tabId;

	// TODO: INSERT BELOW
	if(details.url == "http://localhost:8082/"){
		return;
	}
	//log(details);

	if(tabInfo[tabId] == undefined)
		return;

	//console.log(tabInfo);
	var originUrl = tabInfo[tabId].url;


	// check if it is not thirdParty content
	if(isThirdParty(originUrl, details.url) === "~thirdparty"){
		return;
	}
	// check if it is not a script
	if(isScript(details.url) === "~script"){
		return;
	}

	// check if we already loaded that content (prevents double
	// loading, thx to the second XHR request we need)
	var idx = -1;
	for(var i = 0; i < duplicateUrls.length; i++){
		var dupUrl = duplicateUrls[i];
		if(dupUrl === details.url){
			idx = i;
			break;
		}
	}
	// Handle, if url was not found -> enter it, or delete it
	if(idx == -1) duplicateUrls.push(details.url);
	else {
		duplicateUrls.splice(idx, 1);
		return;
	}

	// call the function that will load the content to store it
	getContent(details.url, tabInfo[tabId], function(content){
		content.command = "result";
		sendCC(content);
	});
}


function requestNewRootUrl(tabId){

	log("Requesting new root url from TAB " + tabId);
	
	tabStatus[tabId]["requestTime"] = Date.now();
	var content = {};

	content.command = "newroot";

	var adr = COMMAND_IP + ":" + COMMAND_PORT + "/";
	var xhr = new XMLHttpRequest();
	//xhr.timeout = 10000;
	xhr.open('POST', adr, true);

	xhr.timeout = 30000;
	xhr.ontimeout = function (e) {
		tabStatus[tabId]["status"] = "undefined";
		loadNextUrlToTab(tabId);
		//console.log("chrome timeout requestNewRootUrl CRITICAL");
	};

	xhr.setRequestHeader("Content-type", "application/json");
	var encoded = JSON.stringify(content);

	xhr.addEventListener('load', function(event) {
		if (xhr.status >= 200 && xhr.status < 300) {


			var rootUrl = JSON.parse(xhr.responseText)["rootUrl"];
			insertRootUrlQueue(rootUrl, tabId);
			tabStatus[tabId]["status"] = "undefined";
			checkTabs();
		} else {
			//console.warn(xhr.statusText, xhr.responseText);
		}
	});
	xhr.send(encoded);
}

function sendAnalyse(rootUrl){
	var content = {};
	content.command = "analyze";
	content.rootUrl = rootUrl;

	sendCC(content)
}

function sendComplete(tabInfo, stat){
	var content = {};
	content.command = "tab"
	content.stat = stat
	content.rootUrl = tabInfo["rootUrl"]

	sendCC(content)
}

function log(message){
	var content = {};

	var now = new Date();
	content.date = now.toLocaleString();
	content.command = "log";
	content.message = message;

	//sendCC(content);
}

function sendResult(tabId){
	var content = {};
	var now = new Date();
	content.date = now.toLocaleString();
	content.result = urlQueues[tabId]["result"];
	content.command = "result";
	sendCC(content);
}

function sendCC(content){
	var now = new Date();
	content.date = now.toLocaleString();

	var adr = RESULT_IP + ":" + RESULT_PORT + "/";
	var xhr = new XMLHttpRequest();
	xhr.open('POST', adr, true);
	xhr.onreadystatechange = function(){
	};
	xhr.setRequestHeader("Content-type", "application/json");
	var encoded = JSON.stringify(content);

	xhr.send(encoded);

}

function clearHistoryAndStart()
{
	chrome.browsingData.remove(
		{},
		{
			"appcache": true,
			"cache": true,
			"cookies": true,
			"downloads": true,
			"fileSystems": true,
			"formData": true,
			"history": true,
			"indexedDB": true,
			"localStorage": true,
			"pluginData": true,
			"passwords": true,
			"webSQL": true
		},
		callback = start
	);
}

chrome.webRequest.onBeforeRequest.addListener(function(details){
	return{ cancel: true};
},
	{urls: ["<all_urls>"], types:["image", "media", "other"]}, ["blocking"]
	);

// ===============================================
// Handling/Listener
// ===============================================

// this is the main routine for message listening!
chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse){
		console.log("got a message");
		if(message.command == "start"){
			start();
			//clearHistoryAndStart();
		}
		if(message.command == "stop"){
			stop();
		}
	}
);

// listen to request and handle them before sending
chrome.webRequest.onBeforeRequest.addListener(
	function(details){
		beforeRequest(details);
	},
	{urls: ["<all_urls>"]}
);

// listen when a tab has finished and give him new tasks
chrome.tabs.onUpdated.addListener(
	function (tabId, changeInfo, tab) {
		tabFinished(tabId, changeInfo, tab);
	}
);



function convertAndFilterLinks(originUrl, originDepth, rootUrl, tabId, urlList){
	var filteredList = [];

	if (urlList == undefined){
		return filteredList;
	}

	for (var i = 0; i < urlList.length; ++i){
		// convert relative links to absolute ones
		if (urlList[i].match(/^http:\/\//) == null && urlList[i].match(/^https:\/\//) == null){
			var originalLink = urlList[i]; // only used for logging

			// filter out JavaScript links
			if (urlList[i].match(/^javascript:/) != null){
				continue;
			}
			// convert "//aaa.de" (seen on wordpress.com)
			else if (urlList[i].match(/^\/\//) != null){
				urlList[i] = "http://" + urlList[i].substring(2);
			}
			// convert "/aaa"
			else if (urlList[i].match(/^\//) != null){
				// remove links to root, if the tab url is the root url 
				if (urlList[i] == "/" && ((originUrl.length - 1) == originUrl.indexOf("/", 9))){
					continue;
				}

				var baseUrl = originUrl;
				if (originUrl.indexOf("/", 9) != -1){
					baseUrl = originUrl.substring(0, originUrl.indexOf("/", 9)); // look for a dash after position 8 (after https://) 
				}

				if (baseUrl == ""){
					continue;
				}

				urlList[i] = baseUrl + urlList[i].substr(0);
			}
			// convert "./aaa"
			else if (urlList[i].match(/^\.\//) != null){
				// remove links to a folder, if the tab url is the folder url 
				if (urlList[i] == "./" && ((originUrl.length - 1) == originUrl.lastIndexOf("/"))){
					continue;
				}

				var baseUrl = originUrl;
				if (originUrl.lastIndexOf("/") > 10){
					baseUrl = originUrl.substring(0, originUrl.lastIndexOf("/")); //remove last bit (e.g. "/index.html")
				}

				if (baseUrl == ""){
					continue;
				}

				urlList[i] = baseUrl + urlList[i].substr(1);
			}
			// convert "../aaa" or multiple ..: "../../aaa"
			else if (urlList[i].match(/^\.\.\//) != null){
				var baseUrl = originUrl;
				if (originUrl.lastIndexOf("/") > 9){
					baseUrl = originUrl.substring(0, originUrl.lastIndexOf("/")); //remove last bit (e.g. "/index.html")
				}

				if (baseUrl == ""){
					continue;
				}

				baseUrl = baseUrl.substr(0, baseUrl.lastIndexOf("/"));	// navigate one level up
				var relativeUrl = urlList[i].substr(2);

				// navigate further up, if there are more "../"
				while (relativeUrl.match(/^\/\.\.\//)){
					relativeUrl = relativeUrl.substr(3);

					baseUrl = baseUrl.substr(0, baseUrl.lastIndexOf("/"));
				}

				urlList[i] = baseUrl + relativeUrl;	
			}
			// filter out all other URI schemes, not browsable (file, news, ftp, git, telnet...)
			else if (urlList[i].match(/\/\//) != null){
				continue;
			}
			// convert all other relative links "aaa" or "#element1" or ""
			else{
				// special case: mailto -> filter out
				if (urlList[i].match(/^mailto:/) != null){
					continue;
				}
				// remove anker and empty relative links, because it references the current resource
				else if (urlList[i] == "" || urlList[i].match(/^#/) != null){
					continue;
				}

				var baseUrl = originUrl;
				if (originUrl.lastIndexOf("/") > 10) {
					baseUrl = originUrl.substring(0, originUrl.lastIndexOf("/"));
				}

				if (baseUrl == ""){
					continue;
				}

				urlList[i] = baseUrl + "/" + urlList[i];
			}

		}

		// remove ankers from URL, because they make no difference. (problem was, that a site is not reloaded and 
		// 	 therefore the DOM is not rebuild, if a anker link is clicked 
		var ankerIndex = urlList[i].indexOf("#");
		if (ankerIndex != -1)
		{
			urlList[i] = urlList[i].substring(0, ankerIndex);
		}

		// check if third party link
		if(isThirdParty(originUrl, urlList[i]) === "thirdparty"){
			continue;
		}

		// check if link is already queued
		var alreadyInQueue = false;
		for (var k = 0; k < urlQueues[tabId]["q"].length; ++k)
		{
			if (urlQueues[tabId]["q"][k].url == urlList[i])
			{
				alreadyInQueue = true;
				break;
			}
		}

		// check if link was already queued
		if (alreadyInQueue == false) {
			for (var k = 0; k < urlQueues[tabId]["oq"].length; ++k) {
				if (urlQueues[tabId]["oq"][k] == urlList[i]) {
					alreadyInQueue = true;
					break;
				}
			}
		}

		//// also check if it is in this list multiple times
		if (alreadyInQueue == false) {
			for (var k = 0; k < i; ++k) {
				if (urlList[k] == urlList[i]) {
					alreadyInQueue = true;
					break;
				}
			}
		}

		// skip if it is already in the queue, the depth is wrong or if is a download link, or it is a different domain and should be the same
		if (alreadyInQueue == true)
		{
			continue;
		}
		if (isUrlDownloadLink(urlList[i]) == true)
		{
			continue;
		}

		filteredList.push(urlList[i]);
	}

	return filteredList;
}

