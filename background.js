chrome.runtime.connect();
chrome.runtime.onMessage.addListener( function(event) {
    if (parseInt(event.text) >0) {
        chrome.browserAction.setBadgeText({
            text: event.text
        });
        chrome.browserAction.setBadgeBackgroundColor({
            color: [200,0,0,100]
        });
    } else {
        chrome.browserAction.setBadgeText({
            text: ""
        });
        chrome.browserAction.setBadgeBackgroundColor({
            color: [200,0,0,0]
        });
    }
});

chrome.browserAction.onClicked.addListener(function(){
    window.open("https://bitbucket.org/dashboard/pullrequests");
});
