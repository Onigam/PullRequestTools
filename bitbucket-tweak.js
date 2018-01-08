// ==UserScript==
// @name         Bitbucket merge conflict detection in PR list
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Shows every conflict in PR list with a nice warning icon
// @author       pjdauvert
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
var SCRIPT_MSG = "Conflict detection enabled, loading...";
console.log("execution of script : " + SCRIPT_ID);

function hideNotif() {
    $( '#' + SCRIPT_ID ).slideUp();
}
$('body').append( '<div id="' + SCRIPT_ID + '" style="display:none;">' + SCRIPT_MSG + '</div>' );

$('#' + SCRIPT_ID).slideDown();

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
var PR_COMMENTS_TO_GET_DESTROYED = 20;
var MINIMUM_REVIEWS = 1;
var SHOW_LOGS = false;
// customization
function getImageNameFromAction(action) {
  switch (action) {
    //case '': return '';
    case 'mergeable': return 'mergeable';
    case 'started': return 'homer-started';
    case 'finished': return 'homer-finished';
    case 'ready': return 'homer_ok';
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
var modifiedFiles = [];

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

function getPRConflictStatus(prId) {
  return new Promise(function(resolve){
    $.ajax(getPRDetailsURL(prId, 1) + '/conflict-status').done(resolve);
  });
}

function getPRDetails(prId) {
  return new Promise(function(resolve) {
    $.ajax(getPRDetailsURL(prId, 2)).done(resolve);
  });
}

function getPRCommittedFiles(prId) {
  var url = getPRDetailsURL(prId, 2) + '/diff';
  return new Promise(function(resolve) {
    $.ajax(url).done(resolve);
  });
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
  var diffMatcher = /(^(-{3}|\+{3}) [ab]?\/(.*)$)|((^\+<{7} destination:.*$)([\s\S]*)(^\+={7}$)([\s\S]*)(^\+>{7} source:.*$))/gm;
  var NO_FILE = 'dev/null';
  var stream = [];
  var match;
  while ((match = diffMatcher.exec(diff)) !== null) {
    if (match.index === diffMatcher.lastIndex) {
        diffMatcher.lastIndex++;
    }
    // Get the result of the next match.
    if (match[1]) { // a new chunk is detected
      if(match[2] === '---') { // extract modified file source
        // console.log('new modified source file found: '+match[3]);
        stream.push({ from: match[3], status: match[3] === NO_FILE ? 'A' : 'M' }); //added if source is /dev/null
      }
      else if (match[2] === '+++') { // extract modified file destination
        // console.log('destination file found: '+match[3]);
        var fileDiff = stream[stream.length-1];
        if (!fileDiff || !fileDiff.from || fileDiff.to) {
          console.error(diff);
          throw new Error('File diff mal formed for:' + match[3]);
        } else {
          fileDiff.to = match[3];
          fileDiff.status = match[3] === NO_FILE ? 'D' : fileDiff.status; //deleted if destination is /dev/null
        }
      }
    }
    if (match[4]) { // Conflict detected
      // console.log('Conflict detected');
      var fileDiff = stream[stream.length-1];
      if (!fileDiff || !fileDiff.from || !fileDiff.to) {
        console.error(diff);
        throw new Error('File diff mal formed before conflict');
      }
      else fileDiff.status = 'C';
    }
  }
  return stream;
}

function buildDiffDetails(diffPage) {
  var filesList = parseDiff(diffPage);
  filesList.forEach(function(file){
    var fileName, fileStatus;
    switch(file.status) {
      case 'A': fileName = file.to; break;
      default: fileName = file.from;
    }
    if(SHOW_LOGS) console.log(file.status + '\t' + fileName + (file.status === 'C' ? ' (conflicted)' : ''))
  });
  var conflicts = filesList.filter(function(file){ return file.status === 'C';}).length;
  if(SHOW_LOGS) console.log('Conflicts found: ' + conflicts);
  return { filesList: filesList, conflictsCount: conflicts };
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

function processPRStatus(pr) {
  if(SHOW_LOGS) console.log(pr)
  //inject source branch name
  $('[data-pull-request-id="'+pr.id+'"] > td.title > div.title-and-target-branch > a.pull-request-title')
    .after(
      '<span class="pull-request-source-branch"><span class="ref-label"><span class="ref branch"><span class="name">'
      + pr.sourceBranchName
      + '</span></span></span></span>'
    );

  // inject recipient
  $('[data-pull-request-id="'+pr.id+'"] > td.title').after('<td class="conflict-detector"></td>');

  // PR inactivity icon :
  var agingIcon = getAgingIcon(pr.createdOn);
  if(agingIcon) injectIcon(pr.id, agingIcon);

  // Sooo many comments
  if(pr.commentCount > PR_COMMENTS_TO_GET_DESTROYED) {
    injectIcon(pr.id, getIcon('destroyed', 'Breeeuuuuum!', getOpacity(pr.author === CURRENT_USER)));
  }

  // Conflicts
  if(pr.conflictsCount){
    injectIcon(pr.id, getIcon('code-conflict', 'This PR has conflicts', getOpacity(pr.author === CURRENT_USER)));
    // Add Nelson sound and update counter in plugin icon
    if (pr.author === CURRENT_USER) {
        // update notification
        conflictsNb++;
        chrome.runtime.sendMessage({ type:"conflicts", text: new String(conflictsNb)});
        var playSound = '<video width="1" autoplay><source src="http://www.myinstants.com/media/sounds/the-simpsons-nelsons-haha.mp3" type="audio/mp4"></video>';
        injectIcon(pr.id, playSound);
    }
  }

  // Review state
  var isAuthorApproved = pr.participants.filter(function(p){ return p.user.username === pr.author && p.approved }).length > 0;
  var mustBeReviewed = pr.participants.filter(function(p){ return p.user.username !== pr.author && p.approved }).length < MINIMUM_REVIEWS;
  if(!isAuthorApproved) {
    injectIcon(
      pr.id,
      getIcon(
        'started',
        pr.author === CURRENT_USER ? 'You must still mark your pull request ready for review' : 'The PR is not yet ready to review!',
        getOpacity(pr.author === CURRENT_USER)
      )
    );
  }
  else if (mustBeReviewed) {
    injectIcon(
      pr.id,
      getIcon(
        pr.author === CURRENT_USER ? 'finished' : 'ready',
        'Ready for review',
        getOpacity(pr.author !== CURRENT_USER)
      )
    );
  } else {
    injectIcon(
      pr.id,
      getIcon(
        'mergeable',
        'Had enough validations! Seems OK to merge it :)',
        getOpacity(ALLOWED_MERGERS.includes(CURRENT_USER))
      )
    );
  }
}

// function to merge PR full details and files diff data
function mergePRFullDetails(prId){
  return function (diffData){
    if(SHOW_LOGS){
      var size = diffData.filesList.length;
      console.log('PR '+ prId +' diff parsed: ('+size+' file'+ (size === 1 ? '' : 's') +' modified)');
    }
    return getPRDetails(prId)
      .then(function(pr) {
        return {
          id: pr.id,
          createdOn: pr.created_on,
          author: pr.author.username,
          participants: pr.participants,
          commentCount: pr.comment_count,
          sourceBranchName: pr.source.branch.name,
          conflictsCount: diffData.conflictsCount,
          filesList: diffData.filesList
        };
      });
    };
}

// retrieve additional PR data to determine status
function fetchPRStatus(pr){
  return getPRCommittedFiles(pr.id)
  .then(buildDiffDetails)
  .then(mergePRFullDetails(pr.id));
}

Promise
  .all(PR_COMPONENT_DATA.values.map(fetchPRStatus))
  .then(function(results) {
    results.forEach(processPRStatus);
    hideNotif();
  });
