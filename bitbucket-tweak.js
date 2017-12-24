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

function getPRConflictStatus(prId, callback) {
  $.ajax(getPRDetailsURL(prId, 1) + '/conflict-status').done(callback);
}

function getPRDetails(prId, callback) {
  $.ajax(getPRDetailsURL(prId, 2)).done(callback);
}

function parseDiff(diff){
  // Regex generating a 10 groups pattern
  // 0 - Matching input
  // 1 - if defined, the destination or source file declaration line-height
  // 2 - the file prefix (either source "--- a" or destination "+++ b")
  // 3 - the file name
  // 4 - if defined, a conflict section
  // 5 - the conflict entering separator (destination)
  // 6 - the conflict destination file code part
  // 7 - the conflict middle separator
  // 8 - the conflict source file code part
  // 9 - the conflict exiting separator (source)
  var diffMatcher = /(^(-{3}|\+{3}) [ab]?\/(.*)$)|((^\+<{7} destination:.*$)([\s\S]*)(^\+={7}$)([\s\S]*)(^\+>{7} source:.*$))/gm
  var stream = [];
  var match;
  while ((match = diffMatcher.exec(diff)) !== null) {
    if (match.index === diffMatcher.lastIndex) {
        diffMatcher.lastIndex++;
    }
    // Get the result of the next match.
    if (match[1]) { // a new chunk is detected
      if(match[2] === '---') { // extract modified file source
        //console.log('new modified source file found: '+match[3]);
        stream.push({ from: match[3] });
      }
      else if (match[2] === '+++') { // extract modified file destination
        //console.log('destination file found: '+match[3]);
        var fileDiff = stream[stream.length-1];
        if (!fileDiff || !fileDiff.from || fileDiff.to) {
          console.error(diff);
          throw new Error('File diff mal formed for:' + match[3]);
        }
        else fileDiff.to = match[3];
      }
    }
    if (match[4]) { // Conflict detected
      //console.log('Conflict detected');
      var fileDiff = stream[stream.length-1];
      if (!fileDiff || !fileDiff.from || !fileDiff.to) {
        console.error(diff);
        throw new Error('File diff mal formed before conflict');
      }
      else fileDiff.conflicted = true;
    }
  }
  return stream;
}

function getPRCommittedFiles(prId, callback) {
  getPRDetails(prId, function(prInfo){
    var url = getPRDetailsURL(prInfo.id, 2) + '/diff';
    $.ajax(url).done(function(diffPage){
      //console.log(diffPage);
      var filesList = parseDiff(diffPage);
      var size = filesList.length;
      console.log('PR '+prId+' diff parsed: ('+size+' file'+ (size === 1 ? '' : 's') +' modified)');
      filesList.forEach(function(file){
        var NO_FILE = 'dev/null';
        var fileName, fileStatus;
        if (file.to === NO_FILE) {
          fileName = file.from; fileStatus = 'D';
        } else if (file.from === NO_FILE) {
          fileName = file.to; fileStatus = 'A';
        } else {
          fileName = file.to; fileStatus = 'M';
        }
        console.log(fileStatus + '\t' + fileName + (file.conflicted ? ' (conflicted)' : ''))
      });
      //console.log(filesList.length + ' modified files in PR ' + prInfo.id);
      var conflicts = filesList.filter(function(file){ return file.conflicted;}).length;
      //console.log('Conflicts:' +  conflicts);
      console.log('Conflicts found: ' + conflicts);
      callback({ filesList: filesList, conflictsCount: conflicts });
    });
  })
}

var getOpacity = function(important) {
    return important ? "1" : "0.6";
}

function getIcon(action, title, opacity) {
  var imageURL = chrome.extension.getURL('img/'+getImageNameFromAction(action)+'.png');
  return '<img title="'+title+'" src="'+ imageURL + '"' + (opacity ? ' style="opacity: '+ opacity + ';"' : '') + '>';
}

function getAgingIcon(lastActivityDate, opacity) {
  var comparisonDate = moment(lastActivityDate);
  if(moment().subtract(3, 'weeks').isAfter(comparisonDate)) return getIcon('very-very-old', 'PR is more than 3 weeks old', opacity);
  else if(moment().subtract(2, 'weeks').isAfter(comparisonDate)) return getIcon('very-old', 'PR is more than 2 weeks old', opacity);
  else if(moment().subtract(1, 'weeks').isAfter(comparisonDate)) return getIcon('old', 'PR is more than a week old', opacity);
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
  // list of commited Files : https://bitbucket.org/hopeitup/hopeitup/pull-requests/:id/:destinationBranchName/diff?_pjax=%23pr-tab-content
  getPRCommittedFiles(pr.id, function(data){
    var files = data.filesList;
  });
  // Reviewable

  // Mergeable
}

// Generate icons
PR_COMPONENT_DATA.values.forEach(processPR);
