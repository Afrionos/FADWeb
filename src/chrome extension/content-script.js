///<reference path="chrome-api-vsdoc.js"/>
///<reference path="jquery-1.10.2-vsdoc.js"/>

function collectLinks() {
	// collect Links from HTML
	var collectedLinks = {};
	collectedLinks.urls = [];
	$("*").each(function() {
		// get all links (<a href="">)
		if ($(this).prop("tagName") === 'A'){
			var link = $(this).attr("href");
			if (link != undefined){
				collectedLinks.urls.push(link);
			}
		}

		// get all links from window.open() and window.location =
		for (var i = 0; i < $(this).prop("attributes").length; ++i)
		{
			// first look for window.location or window.location.href
			var windowLocationHtml = $(this).prop("attributes").item(i).value.match(/window\.location\.?(href)?\s*=\s*((')|(")).*((')|("))/g);
			if (windowLocationHtml != null) {
				var windowLocationAddresses = parseAddressFromWindowLocationAssignments(windowLocationHtml);

				for (var j = 0; j < windowLocationAddresses.length; ++j)
				{
					collectedLinks.urls.push(windowLocationAddresses[j]);
				}
			}

			// also look for window.open()
			var windowOpenHtml = $(this).prop("attributes").item(i).value.match(/window\.open\(.*\)/g);
			if (windowOpenHtml != null)	{
				var windowOpenAddresses = parseAddressFromWindowOpenArguments(windowOpenHtml);
				for (var j = 0; j < windowOpenAddresses.length; ++j)
				{
					collectedLinks.urls.push(windowOpenAddresses[j]);
				}
			}
		}
	}
	);

	// collect links from JavaScript, because JavaScript is not part of the DOM
	var scripts = document.getElementsByTagName("script");
	for (var i = 0; i < scripts.length; ++i)
	{
		// only parse JavaScript
		if (scripts[i].type == "text/javascript")
		{
			var scriptText = scripts[i].innerHTML; // this only works for inlined JavaScript. event works for comments! external scripts: a file named with "src=..." is not working!
			// look for window.location and window.location.href, followed by = and a quote (" or '); whitespace doesn't matter 
			var windowLocationJavaScript = scriptText.match(/window\.location\.?(href)?\s*=\s*((')|(")).*((')|("))/g); 
			if (windowLocationJavaScript != null)
			{
				var windowLocationAddresses = parseAddressFromWindowLocationAssignments(windowLocationJavaScript);
				for (var j = 0; j < windowLocationAddresses.length; ++j)
				{
					collectedLinks.urls.push(windowLocationAddresses[j]);
				}
			}

			// also look for window.open()
			var windowOpenJavaScript = scriptText.match(/window\.open\(.*\)/g);
			if (windowOpenJavaScript != null)
			{
				var windowOpenAddresses = parseAddressFromWindowOpenArguments(windowOpenJavaScript);
				for (var j = 0; j < windowOpenAddresses.length; ++j)
				{
					collectedLinks.urls.push(windowOpenAddresses[j]);
				}
			}
		}
	}

	return collectedLinks.urls;
}

chrome.runtime.onMessage.addListener(
		function(request, sender, sendResponse) {
			if (request.command == "collectLinks"){
				//console.log("content: received");
				sendResponse(collectLinks());
			}
		}
		);
