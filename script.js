

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

// script begins here
var merger = "Romain Fromi";

// Counter Initialized to Zero
var conflictsNb = 0;
chrome.runtime.sendMessage({ type:"conflicts", text: "0"});

var isUserName = function(userNameToCompareTo) {
    var userName = $(".aid-profile--name").text();
    return userName.trim() === userNameToCompareTo.trim();
};

var getOpacity = function(important) {
    return important ? "1" : "0.6";
}

var checkMigrationScriptConflict = function (migrationFileDir, sourceBranchLink, sourceBranch, targetBranchLink, targetBranch, self, infoNodeId) {
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
                        var conflictUserName = self.find(".user").find("span[title]").text();
                        var opacity = getOpacity(isUserName(conflictUserName));
                        var maggieUrl = chrome.extension.getURL("img/script-conflict.png");
                        var sqlScriptMsgTitle = scriptConflicts == 1 ? "1 SQL script to rename" : scriptConflicts + " SQL scripts to rename";
                        self.find("#"+infoNodeId)
                        .prepend('<img  title="' + sqlScriptMsgTitle + '" src="'+maggieUrl+'" style="width:57px;height:35px;margin-right:10px;opacity:' + opacity + '">');
                    }

                }).fail(function(data){

                });
            });
        });
    });
    return result;
}

var prCount = $("#pullrequests-count");
if (prCount.text() > 20) {
    prCount.css({'background-color': '#DF0101', 'color': 'white'});
} else if (prCount.text() > 10) {
    prCount.css({'background-color': '#FF8000', 'color': 'white'});
};

var buildInfoNode = function(index) {
    var infoNode = $('<div></div>');
    infoNode.attr("id", "info-node-"+index);
    return infoNode;
}

var scrapAndUpdateDom = function(author, userApproved, approveCount, mergeable, prId, prlink, self, infoNodeId, newUI) {

    if (!newUI) {
        $.ajax('https://bitbucket.org/!api/1.0/repositories/ejust/ejust/pullrequests/' + prId + '/participants').done(function(participants){
            //console.log("processing PR #" + prId);
            var userMerger = isUserName(merger);
            var authorApproved = false;
            for (var i = 0; i < participants.length; i++) {
                if (participants[i].display_name === author && participants[i].approved) {
                    authorApproved = true;
                    break;
                }
            }
            var approvedByMeOnly = approveCount == 1 && authorApproved;
            var userIsAuthor = isUserName(author);
            var homerStartedUrl = chrome.extension.getURL("img/homer-started.png");
            var homerFinishedUrl = chrome.extension.getURL("img/homer-finished.png");
            var homerUrl = chrome.extension.getURL("img/homer_ok.png");
            var donutUrl = chrome.extension.getURL("img/mergeable.png");
            var homerElement = userIsAuthor && !authorApproved ? '<img title="You must still mark your pull request ready for review" src="'+homerStartedUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:1;">'
            : mergeable ? '<img title="Ready for review with enough validations! Seems OK to merge it" src="'+donutUrl+'" style="width:35px;height:35px;margin-right:10px;'+(userMerger?'':userApproved?'display:none;':'opacity:0.3;')+'">'
            : userIsAuthor && approvedByMeOnly ? '<img title="Approved by me only. Somebody wants to validate? Please?" src="'+homerFinishedUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:0.3">'
            : !userIsAuthor && authorApproved ? '<img title="Ready for review" src="'+homerUrl+'" style="width:35px;height:35px;margin-right:10px;">' : undefined;
            if (homerElement) {
                self.find("#"+infoNodeId).prepend(homerElement);
            }
        });
    }

    $.ajax(prlink + '/activity?_pjax=%23pr-tab-content').done(function(data) {
        // is it an old PR?
        var prDom = $.parseHTML('<div>'+data+'</div>');
        var activity = $("#comments", prDom);
        var prDate = new Date(activity.find(".summary").has("span:contains('opened')").find("time").attr("datetime"));
        var now = new Date();
        var oldRequestImgUrl = chrome.extension.getURL("img/old.png");
        var veryOldRequestImgUrl = chrome.extension.getURL("img/very-old.png");
        var veryVeryOldRequestImgUrl = chrome.extension.getURL("img/very-very-old.png");
        prDate.setDate(prDate.getDate() + 7);
        var prMoreThanOneWeekOld = prDate < now;
        prDate.setDate(prDate.getDate() + 7);
        var prMoreThanTwoWeeksOld = prDate < now;
        prDate.setDate(prDate.getDate() + 7);
        var prMoreThanThreeWeeksOld = prDate < now;
        var userMerger = isUserName(merger);
        var opacity = getOpacity(userMerger);
        if(prMoreThanThreeWeeksOld) {
            self.find("#"+infoNodeId).prepend('<img title="PR is more than 3 weeks old" src="'+veryVeryOldRequestImgUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:' + opacity + '">');
        } else if(prMoreThanTwoWeeksOld) {
            self.find("#"+infoNodeId).prepend('<img title="PR is more than 2 weeks old" src="'+veryOldRequestImgUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:' + opacity + '">');
        } else if(prMoreThanOneWeekOld) {
            self.find("#"+infoNodeId).prepend('<img title="PR is more than a week old" src="'+oldRequestImgUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:' + opacity + '">');
        }

        // comment count
        var commentElement = self.find(".flex-content--secondary .pullrequest-stats .count")[0];
        if (commentElement) {
            var commentCount = parseInt(commentElement.innerHTML);
            if (commentCount > 30) {
                var manyCommentsImgUrl = chrome.extension.getURL("img/homer-destroy.png");
                self.find("#"+infoNodeId).prepend('<img title="PR has more than 30 comments" src="'+manyCommentsImgUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:' + opacity + '">');
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

        var diffLink = newUI ? prlink+ "/" +sourceBranchName + "/diff" : prlink + "/diff";

        $.ajax(diffLink).done(
            function(data) {
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
                    checkMigrationScriptConflict("/"+migrationFileDir+"/", sourceBranchLink, sourceBranchName, targetBranchLink, targetBranchName, self, infoNodeId);
                }

                var conflictIndex = data.split("<strong>Conflict: File modified in both source and destination</strong>").length -1;
                if (conflictIndex > 0 && self.find(".aid-profile")) {
                    var conflictStr = conflictIndex > 1 ?  " " + conflictIndex + " file conflicts " : " 1 file conflict ";
                    var nelsonUrl = chrome.extension.getURL("img/code-conflict.png");
                    var conflictUserName = container.find(".user").find("span[title]").text();
                    if (isUserName(conflictUserName)) {
                        conflictsNb++;
                        var playSound = '<video width="1" autoplay><source src="http://www.myinstants.com/media/sounds/the-simpsons-nelsons-haha.mp3" type="audio/mp4">p</video>';
                        chrome.runtime.sendMessage({ type:"conflicts", text: new String(conflictsNb)});
                        self.find("#"+infoNodeId).prepend('<img title="'+conflictStr+'" src="'+nelsonUrl+'" style="width:35px;height:35px;margin-right:10px;">'+ playSound);
                    } else {
                        self.find("#"+infoNodeId).prepend('<img title="'+conflictStr+'" src="'+nelsonUrl+'" style="width:35px;height:35px;margin-right:10px;opacity:0.3;">');
                    }
               }
            }
        );



        self.find(".flex-content--primary").append("<br>" + sourceBranchName + " -> " + targetBranchName);
    });

}

// New bitbucket ui
$(".pull-request-row").each(function(index) {
    var self = $(this);
    var execElem = self.find(".pull-request-title");
    var infoNode = buildInfoNode(index);
    infoNode.attr("style", "float:right;height:30px; margin-top: -35px;");
    self.find(".title").append();

    var prlink = execElem.attr("href");
    var prId = prlink.substring(prlink.lastIndexOf("/") + 1, prlink.length);
    var author = self.find(".pull-request-author img").attr("title");
    var approveCount = self.find(".reviewers").has(".approved").length;
    var userApproved = approveCount > 0;
    var mergeable = approveCount > 1;

    console.log("---------------------");
    console.log("prlink : " + prlink);
    console.log("prId : " + prId);
    console.log("author : " + author);
    console.log("userApproved : " + userApproved);
    console.log("approveCount : " + approveCount);
    console.log("mergeable : " + mergeable);
    console.log("---------------------");

    scrapAndUpdateDom(author, userApproved, approveCount, mergeable, prId, prlink, self, "info-node-"+index, true);
});


// Old bitbucket ui
$(".pullrequest-list .iterable-item").each(function(index) {
    var container = $(this);
    var self = container.find(".title.flex-content--column");
    self.css("height","35px");
    self.find(".flex-content").css("height","35px");
    var execElem = self.find(".flex-content--primary .execute");
    self.find(".flex-content--secondary .pullrequest-stats").append(buildInfoNode(index));

    var prlink = execElem.attr("href");
    var prId = /^#(\d+)\:.*$/g.exec(execElem.attr("title"))[1];
    var author = container.find("td.user a").attr("title");
    var userApproved = container.find(".list-stat").has("a.approved").length > 0;
    var approveCount = container.find(".list-stat").has("a.approval-link").find(".count").html();
    var mergeable = approveCount > 1;

    console.log("---------------------");
    console.log("prlink : " + prlink);
    console.log("prId : " + prId);
    console.log("author : " + author);
    console.log("userApproved : " + userApproved);
    console.log("approveCount : " + approveCount);
    console.log("mergeable : " + mergeable);
    console.log("---------------------");

    scrapAndUpdateDom(author, userApproved, approveCount, mergeable, prId, prlink, self, "info-node-"+index);
});
