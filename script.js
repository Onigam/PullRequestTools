

// ==UserScript==
// @name         Bitbucket merge conflict detection in PR list
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows every conflict in PR list with a nice warning icon
// @author       Mik
// @match        https://bitbucket.org/ejust/ejust/pull-requests/
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

// notification of script execution
var SCRIPT_ID = "bitbucket-merge-conflict-detection-in-pr-list";
var SCRIPT_MSG = "conflict detection enabled";
console.log("execution of following script : " + SCRIPT_ID);
var hideNotif = function() {
    $( "#" + SCRIPT_ID ).slideUp();
}
$( "body" ).append( "<div id='" + SCRIPT_ID + "' style='display: none; position: fixed; border-radius: 10px; bottom: 10px; left: 10px; background-color: rgba(0,150,0,1); color: white; z-index: 1000; height: 20px; width:auto; padding:10px;text-align:center;vertical-align:middle;line-height:20px;'>" + SCRIPT_MSG + "</div>" );
$("#" + SCRIPT_ID).slideDown().on('click', function() {
    hideNotif();
});
setTimeout(function() {
    hideNotif();
}, 15000);

//Counter Initialized to Zero
var i = 0;
chrome.runtime.sendMessage({ type:"conflicts", text: "0"});
// script begins here
$(".pullrequest-list .iterable-item").each(function(index) {
    console.log(index);
    var container = $(this);
    var self = $(this).find(".title.flex-content--column");
    self.css("height","35px");
    self.find(".flex-content").css("height","35px");
    var prlink = self.find(".flex-content--primary .execute").attr("href");
    $.ajax(prlink + "/diff").done(
        function(data) {
            var conflictIndex = data.split("<strong>Conflict: File modified in both source and destination</strong>").length -1;
            if (conflictIndex > 0) {
                var conflictStr = conflictIndex > 1 ?  " " + conflictIndex + " conflicts " : " 1 conflict ";
                var userName = $(".aid-profile--name").text();
                var conflictUserName = container.find(".user").find("span[title]").text();
                var playSound = "";
                console.log("userName=" + userName + " conflictUserName=" + conflictUserName);
                if (userName.trim() == conflictUserName.trim()) {
                    playSound = '<video width="1" autoplay><source src="http://www.myinstants.com/media/sounds/the-simpsons-nelsons-haha.mp3" type="audio/mp4">p</video>';
                }
                if (self.find(".aid-profile")) {
                    if (playSound!="") {
                        i++;
                        console.log("conflicts: " + i);
                        chrome.runtime.sendMessage({ type:"conflicts", text: new String(i)});
                        self.find(".flex-content--secondary .pullrequest-stats").prepend('<div class="list-stat"  title="Conflict"><span style="width:35px;height:35px;">'+conflictStr+'</span></div><div class="list-stat" title="Conflict"><img src="http://vignette4.wikia.nocookie.net/les-simpson-springfield/images/c/c9/Nelson_Icon.png/revision/latest?cb=20150622221328&path-prefix=fr" style="width:35px;height:35px;"></div>'+ playSound);
                        container.css("background-color", "#FA98A9");
                    } else {
                        self.find(".flex-content--secondary .pullrequest-stats").prepend('<div class="list-stat" title="Conflict"><span style="width:35px;height:35px;">'+conflictStr+'</span></div><div class="list-stat" title="Conflict"><img src="http://vignette4.wikia.nocookie.net/les-simpson-springfield/images/c/c9/Nelson_Icon.png/revision/latest?cb=20150622221328&path-prefix=fr" style="width:35px;height:35px;"></div>');
                    }
                }
               } else {
                self.find(".flex-content--secondary .pullrequest-stats").prepend('<div class="list-stat" title="Conflict"><span style="width:35px;height:35px;">no conflicts</span></div>');
            }
        }
    );
});
