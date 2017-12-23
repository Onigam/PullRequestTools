// ==UserScript==
// @name         Bitbucket merge conflict detection in PR list
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows every conflict in PR list with a nice warning icon
// @author       Mik
// @match        https://bitbucket.org/*/*/pull-requests/
// @grant        none
// ==/UserScript==
/* jshint -W097 */
'use strict';

// Inject extension css
var styleElement = document.createElement('link');
styleElement.rel = 'stylesheet';
styleElement.href = chrome.extension.getURL("css/bitbucket-tweak.css");
document.getElementsByTagName('head')[0].appendChild(styleElement);

// notification of script execution
var SCRIPT_ID = "conflict-detector-notification";
var SCRIPT_MSG = "Conflict detection enabled";
console.log("execution of following script : " + SCRIPT_ID);

function hideNotif() {
    $( '#' + SCRIPT_ID ).slideUp();
}
$('body').append( '<div id="' + SCRIPT_ID + '" style="display:none;">' + SCRIPT_MSG + '</div>' );

$('#' + SCRIPT_ID).slideDown().on('click', function() {
    hideNotif();
});
setTimeout(function() {
    hideNotif();
}, 5000);

// script begins here

// Constants
var BITBUCKET_HTML_ROOT = 'https://bitbucket.org/';
var BITBUCKET_API_V1_ROOT =  BITBUCKET_HTML_ROOT + '!api/1.0/repositories/';
var BITBUCKET_API_V2_ROOT =  BITBUCKET_HTML_ROOT + '!api/2.0/repositories/';
var REPOSITORY = JSON.parse($('#pr-shared-component').attr('data-api-repo')).full_name;
var CURRENT_USER = JSON.parse($('#pr-shared-component').attr('data-api-user')).username;
var PR_COMPONENT_DATA = JSON.parse($('#pr-shared-component').attr('data-initial-prs'));

// Settings
var ALLOWED_MERGERS = ['pjdauvert', 'onigam'];
var PR_COMMENTS_TO_GET_DESTROYED = 10;
var MINIMUM_REVIEWS = 1;
// customization
function getImageNameFromAction(action) {
  switch (action) {
    //case '': return '';
    case 'code-conflict': return 'code-conflict';
    case 'old': return 'old';
    case 'very-old': return 'very-old';
    case 'very-very-old': return 'very-very-old';
    case 'destroyed': return 'homer-destroy';
    default: return "unknown";
  }
}

// Counter Initialized to Zero
var conflictsNb = 0;
chrome.runtime.sendMessage({ type:"conflicts", text: "0"});

// Bitbucket API scrapping
function getPRDetailsURL(prId, apiVersion) {
  var root;
  switch(apiVersion){
    case 1: root = BITBUCKET_API_V1_ROOT; break;
    case 2: root = BITBUCKET_API_V2_ROOT; break;
    default: root = BITBUCKET_HTML_ROOT;
  }
  return root + REPOSITORY + '/pullrequests/' + prId;
}

function getPRActivityURL(prId) {
  return getPRDetailsURL(prId, 2) + '/activity';
}

function getPRConflictStatus(prId, callBack) {
  $.ajax(getPRDetailsURL(prId, 1) + '/conflict-status').done(callBack);
}

function getPRCommitedFiles(prId, callBack) {
  $.ajax(getPRDetailsURL(prId)).done(callBack);
}

var getOpacity = function(important) {
    return important ? "1" : "0.6";
}

function getIcon(action, title, opacity) {
  var imageURL = chrome.extension.getURL('img/'+getImageNameFromAction(action)+'.png');
  return '<img title="'+title+'" src="'+ imageURL + '"' + (opacity ? ' style="opacity: '+ opacity + ';"' : '') + '>';
}

function getAgingIcon(lastActivityDate, opacity) {
  var comparisonDate = new Date(lastActivityDate);
  var now = new Date();
  var prMoreThanOneWeekOld = new Date(comparisonDate.getDate() + 7) < now;
  var prMoreThanTwoWeeksOld = new Date(comparisonDate.getDate() + 14) < now;
  var prMoreThanThreeWeeksOld = new Date(comparisonDate.getDate() + 21) < now;
  if(prMoreThanOneWeekOld) return getIcon('old', 'PR is more than a week old', opacity);
  else if(prMoreThanOneWeekOld) return getIcon('very-old', 'PR is more than 2 weeks old', opacity);
  else if(prMoreThanOneWeekOld) return getIcon('very-very-old', 'PR is more than 3 weeks old', opacity);
  else return;
}

function injectIcon(prId, icon) {
    $('[data-pull-request-id="'+prId+'"] td.conflict-detector').prepend(icon);
}

function processPR(pr) {
  console.log(pr)
  // inject recipient
  $('[data-pull-request-id="'+pr.id+'"] > td.title').after('<td class="conflict-detector"></td>');

  // PR inactivity icon :
  var agingIcon = getAgingIcon(pr.created_on);
  if(agingIcon) injectIcon(pr.id, agingIcon);

  // Sooo many comments
  if(pr.comment_count > PR_COMMENTS_TO_GET_DESTROYED) {
    injectIcon(pr.id, getIcon('destroyed', 'Breeeuuuuum!', getOpacity(pr.author.username === CURRENT_USER)));
  }

  // Conflicts
  // API : https://bitbucket.org/!api/1.0/repositories/hopeitup/hopeitup/pullrequests/:id/conflict-status
  getPRConflictStatus(pr.id, function(result) {
    if(result.isconflicted){
      injectIcon(pr.id, getIcon('code-conflict', 'This PR has conflicts', getOpacity(pr.author.username === CURRENT_USER)));
      // Add Nelson sound and update counter in plugin icon
      if (pr.author.username === CURRENT_USER) {
          // update notification
          conflictsNb++;
          chrome.runtime.sendMessage({ type:"conflicts", text: new String(conflictsNb)});
          var playSound = '<video width="1" autoplay><source src="http://www.myinstants.com/media/sounds/the-simpsons-nelsons-haha.mp3" type="audio/mp4"></video>';
          injectIcon(pr.id, playSound);
      }
    }
  });

  // Data Migration Scrits
  getPRCommitedFiles(pr.id, console.log);
  // Reviewable

  // Mergeable
}

// Generate icons
PR_COMPONENT_DATA.values.forEach(processPR);
