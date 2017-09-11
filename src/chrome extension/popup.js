///<reference path="chrome-api-vsdoc.js"/>
///<reference path="jquery-1.10.2-vsdoc.js"/>

function collectLinks(){
	var message = {};
	message.command = "start";

	chrome.runtime.sendMessage(message);

}

function stopLinks(){
	var message = {};
	message.command = "stop";

	chrome.runtime.sendMessage(message);
}


function answerLinks(urllist){
	console.log("receivedMessage");
	document.getElementById('urls').textContent = urllist;

	if(urllist != undefined){
		document.getElementById('countUrls').textContent = urllist.length;
	}
}

document.getElementById('get-links').onclick = collectLinks;
document.getElementById('stop-links').onclick = stopLinks;
