

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

// Counter Initialized to Zero
var i = 0;
chrome.runtime.sendMessage({ type:"conflicts", text: "0"});

function checkMigrationScriptConflict(migrationFileDir, sourceBranchLink, sourceBranch, targetBranchLink, targetBranch, self) {
    var result = sourceBranch + " -> " + targetBranch;

    // Get the last commit number
    $.ajax(sourceBranchLink).done(function(data){
        var sourceBranchLinkElement = $("#branch-detail", $.parseHTML(data)).find(".aui-buttons > a");
        var srcUrl = sourceBranchLinkElement.attr("href");
        $.ajax(targetBranchLink).done(function(data){
            var targetBranchLinkElement = $("#branch-detail", $.parseHTML(data)).find(".aui-buttons > a");
            var destUrl = targetBranchLinkElement.attr("href");
            // /src/main/resources/db/migration/
            var srcUrlTab = srcUrl.split("?");
            var destUrlTab = destUrl.split("?");
            $.ajax(srcUrlTab[0]+migrationFileDir+"?"+srcUrlTab[1]).done(function(data){
                var srcFilesContainer =  $("#source-list", $.parseHTML(data));
                var srcFiles = srcFilesContainer.find(".name.filename").find("a");
                $.ajax(destUrlTab[0]+migrationFileDir+"?"+destUrlTab[1]).done(function(data){
                    var destFilesContainer =  $("#source-list", $.parseHTML(data));
                    var destFiles = destFilesContainer.find(".name.filename").find("a");

                    var scriptConflicts = 0;
                    srcFiles.each(function(index){
                        var srcFileName = $(this).attr("title");
                        var srcScriptVersion = srcFileName.split("__")[0];
                        var srcScriptName = srcFileName.split("__")[1];
                        destFiles.each(function(index){
                            var destFileName = $(this).attr("title");
                            var destScriptVersion = destFileName.split("__")[0];
                            var destScriptName = destFileName.split("__")[1];
                            if (srcScriptVersion == destScriptVersion) {
                                if (srcScriptName !== destScriptName) {
                                    scriptConflicts++;
                                }
                            }
                        });
                    });

                    if (scriptConflicts > 0) {
                        var sqlScriptMsgTitle = scriptConflicts == 1 ? "1 SQL script to rename" : scriptConflicts + " SQL scripts to rename";
                        self.find(".flex-content--secondary .pullrequest-stats .list-stat[title=Conflict]")
                        .prepend('<div class="list-stat" title="' + sqlScriptMsgTitle + '"><img src="http://www.jesusat2am.com/public_html/jesusat2am.com/media/uploads//simpsons-babies-fight.jpg" style="width:57px;height:35px;"></div>');
                        //.append(innerHTML);
                    } else {
                        self.find(".flex-content--secondary .pullrequest-stats .list-stat[title=Conflict]")
                        .prepend('<div class="list-stat">&nbsp;</div>');
                    }

                }).fail(function(data){
                    self.find(".flex-content--secondary .pullrequest-stats .list-stat[title=Conflict]")
                    .prepend('<div class="list-stat">&nbsp;</div>');
                });
            });
        });
    });/*
    https://bitbucket.org/ejust/ejust/src/d6936475e7203a5f8e61ada5f830decdff7f7f46?at=EJ-838-payline-transaction-date

    */
    // TODO Compare the 2 branches

    return result;
}


// script begins here
$(".pullrequest-list .iterable-item").each(function(index) {
    var container = $(this);
    var self = container.find(".title.flex-content--column");
    self.css("height","35px");
    self.find(".flex-content").css("height","35px");
    var execElem = self.find(".flex-content--primary .execute");
    var prlink = execElem.attr("href");
    var prId = /^#(\d+)\:.*$/g.exec(execElem.attr("title"))[1];
    var author = container.find("td.user a").attr("title");
    $.ajax('https://bitbucket.org/!api/1.0/repositories/ejust/ejust/pullrequests/' + prId + '/participants').done(function(participants){
        for (i = 0; i < participants.length; i++) {
            if (participants[i]['display_name'] === author) {
                if (participants[i]['approved']) {
                    console.log("PR " + prId + " marked ready for review by " + author);
                    self.find(".flex-content--secondary .pullrequest-stats").prepend('<div class="list-stat" title="Ready for review"><img src="http://marijnhaverbeke.nl/talks/ff2011/homer_ok.png" style="width:35px;height:35px;"></div>');
                }
                break;
            }
        }
    });

    $.ajax(prlink).done(function(data){

        var prDom = $.parseHTML(data);

        var sourceLinkContainer = $("#id_source_group", prDom);
        var sourceLinkElem = sourceLinkContainer.find(".branch.unabridged");
        var sourceBranchName = sourceLinkElem.find("a").attr("title");
        var sourceBranchLink = sourceLinkElem.find("a").attr("href");

        var targetLinkContainer = $("#id_target_group", prDom);
        var targetLinkElem = targetLinkContainer.find(".branch.unabridged");
        var targetBranchName = targetLinkElem.find("a").attr("title");
        var targetBranchLink = targetLinkElem.find("a").attr("href");

        $.ajax(prlink + "/diff").done(
            function(data) {
                // branch unabridged a
                // Check migration files
                var fileCommitedContainer = $("#commit-files-summary", $.parseHTML(data));
                var files = fileCommitedContainer.find(".iterable-item");
                var migrationFileToCheck = false;
                var migrationFileDir = null;
                files.each(function(index, value) {

                    var filePath = $(this).attr("data-file-identifier");
                    if (filePath){
                        if (filePath.split("src/main/resources/db/migration/").length -1>0) {
                            migrationFileToCheck = true;
                            migrationFileDir = filePath.match(/(.*)[\/\\]/)[1]||'';
                            return false;
                        } else {
                            return true;
                        }
                    }
                });

                if (migrationFileToCheck) {
                    checkMigrationScriptConflict("/"+migrationFileDir+"/", sourceBranchLink, sourceBranchName, targetBranchLink, targetBranchName, self);
                }

                var conflictIndex = data.split("<strong>Conflict: File modified in both source and destination</strong>").length -1;
                if (conflictIndex > 0) {
                    var conflictStr = conflictIndex > 1 ?  " " + conflictIndex + " file conflicts " : " 1 conflict ";
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
                    self.find(".flex-content--secondary .pullrequest-stats").prepend('<div class="list-stat" title="Conflict"><span style="width:35px;height:35px;">&nbsp;</span></div>');
                    }
            }
        );



        self.find(".flex-content--primary").append("<br>" + sourceBranchName + " -> " + targetBranchName);
    });

});
