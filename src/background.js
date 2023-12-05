'use strict';

// With background scripts you can communicate with popup
// and contentScript files.
// For more information on background script,
// See https://developer.chrome.com/extensions/background_pages

// import npm packaes and scripts
import { v4 as uuidv4 } from 'uuid';
import {credentials} from '../creds';


// Tallies for worker events
var clickCount = 0;
var scrollCount = 0;
var focusCount = 0;
var blurCount = 0;
var keypressCount = 0;
var currentWindowId = null;

// Creates a mapping between tabId and url
var tabToUrl = {};

// create a mapping between user id and spreadsheet id
var useridToSpreadsheet = {};

// spreadsheet api params
const params = {
  spreadsheetId: credentials.SPREADSHEET_ID,
  range: 'Sheet1',
  valueInputOption: 'RAW',
  insertDataOption: 'INSERT_ROWS'
}

// 
// gapi.load('client:auth2', function() {
//   gapi.client.init({
//     'apiKey': credentials.API_KEY,
//     'clientId': credentials.CLIENT_ID,
//     'scope': credentials.SCOPE,
//     'discoveryDocs': ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
//   }).then(()=> {
//   });
// });

// This is used for tracking the record to post the tallies to when a new tabchange is detected
var lastLogID = null;

// Used for keeping track of the most recent web request - used to prevent over-reporting in the case of redirections
var currentTabUrl = null;

var lastWebRQ = null;

// store the unique user id
let userid;

// add the user logs to google spreadsheet
async function handleAddLogs (timestamp, event, url, tab_id) {

    // assign the userid from the chrome local storage
    await chrome.storage.local.get(["userid"]).then((result) => {
      userid = result.userid;
    });

    // export the object to the google spreadsheet
    const obj = [{
        uid: userid,
        timestamp: timestamp.toString(),
        event: event,
        url: url,
        tab_id: tab_id.toString()
    }];
    // console.log(userid);

    const valueRangeBody = {
      'majorDimension': 'ROWS',
      'values': [obj]
    }

    // let request = gapi.client.sheets.spreadsheets.values.append(params, valueRangeBody);
    // request.then(function (response) {
    //   // TODO: Insert desired response behaviour on submission
    //   console.log(response.result);
    // }, function (reason) {
    //   console.error('error: ' + reason.result.error.message);
    // });
    
}

// function to post the count of the events by the user (for future use)
async function addCountLogs(id) {
    const obj = {
        scrollCount: scrollCount,
        blurCount: blurCount,
        focusCount: focusCount,
        clickCount: clickCount,
        keypressCount: keypressCount
    };
}

// Extracts the domain from a url string using regex
function getHostnameFromRegex (url) {
    // We run the regex
    const matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
    // Get hostname (will be null if no match is found)
    return matches && matches[1];
}

// Will alias the url if it is a non-toloka domain
function processUrl(url) {
    const hostname = getHostnameFromRegex(url);
    return hostname;
}

// generate a unique id for each user
function generateUniqueId() {
  return uuidv4();
}

// generate a unique id for user when chrome is installed 
// user id can be used later to create a mapping with spreadsheet id
chrome.runtime.onInstalled.addListener(function(details) {
  if(details.reason === 'install') {
    const userId = generateUniqueId();
    // console.log("user id generated", userId);

    // set the user id in chrome storage to access it later
    chrome.storage.local.set({'userid': userId}).then(() => {
      console.log("set the user id in storage");
    });
  }
})

// Handles messages from the content script, tallies are updated here
chrome.runtime.onMessage.addListener(function(msg, sender, res) {
    msg = msg.type;
    // Update tallies as necessary
    if (msg == 'CLICK') clickCount += 1;
    if (msg == 'FOCUS') focusCount += 1;
    if (msg == 'BLUR') blurCount += 1;
    if (msg == 'SCROLL') scrollCount += 1;
    if (msg == 'PRESS') keypressCount += 1;

    console.log("CLICK " + clickCount + " FOCUS " + focusCount + " BLUR " + blurCount + " SCROLL " + scrollCount + " PRESS " + keypressCount);
});

// fires an alarm 
chrome.alarms.onAlarm.addListener(function( alarm ) {
    alert("hey you need to rest!!");
  });

// clears the alarm when the window is changed and creates a new alarm for the new window
chrome.windows.onFocusChanged.addListener(async function(windowId) {
    if(currentWindowId != windowId) {
        currentWindowId = windowId;
        chrome.alarms.clearAll();
        chrome.alarms.create('alarmName', {
            delayInMinutes: 300, 
        });
    } else {
        chrome.alarms.clearAll();
    }
});

// creates an alarm when window is launched
chrome.windows.onCreated.addListener(async function(window) {
    chrome.alarms.create("alarmName", { delayInMinutes: 300, periodInMinutes: 300});
});

// clears alarm when window is removed
chrome.windows.onRemoved.addListener(async function(window) {
    chrome.alarms.clear("alarmName");
});

// Captures tab change event on activation
chrome.tabs.onActivated.addListener(async function (activeInfo) {

    await chrome.tabs.get(activeInfo.tabId, async function (tab) {
        const time = new Date()
        console.log("in activated", tab);
        const url = processUrl(tab.url);
        currentTabUrl = tab.url;

        if (lastLogID != undefined && lastLogID != null && lastLogID != -1) {
            await addCountLogs(lastLogID);
        }
        handleAddLogs(time.getTime(), "TABACTIVATED", tab.url, activeInfo.tabId);
    });
});

// Updates tab id and url pair when changing
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    console.log("on updated", tab)
    const url = processUrl(currentTabUrl);
    console.log(tabId, tab.url);
    // Store tabId and tab url as key value pair:
    tabToUrl[tabId] = tab.url;
});

// Captures tab change event on update
chrome.tabs.onUpdated.addListener(async function (tabId, change, tab) {
    // await handleTimerEvent();
    if (tab.active && change.url) {
        const time = new Date()
        const url = processUrl(tab.url);
        
        currentTabUrl = tab.url;

        // console.log("TABUPDATED " + time.getTime() + " " + tab.url + " " + tabId)
        if (lastLogID != undefined && lastLogID != null && lastLogID != -1) {
            await addCountLogs(lastLogID);
        }
        handleAddLogs(uid, time.getTime(), "TABUPDATED", tab.url, tabId);
    }
});

// Captures tab removal event
chrome.tabs.onRemoved.addListener(async function (tabId, removeInfo) {
    // Since tab is not available inside onRemoved,
    // we have to use the mapping we created above to get the removed tab url:
    const time = new Date();

    // console.log("SKIPPING: ", tabToUrl[tabId] == undefined)
    // console.log(tabId, tabToUrl[tabId]);
    if (tabToUrl[tabId] == undefined) return;
    console.log("on remove", tab)
    const url = processUrl(tabToUrl[tabId]);

    // Handles put request
    if (lastLogID != undefined && lastLogID != null && lastLogID != -1) {
        await addCountLogs(lastLogID);
    }

    // Remove information for non-existent tab
    // console.log("TABCLOSED " + time.getTime() + " " + url + " " + tabId);
    await handleAddLogs(uid, time.getTime(), "TABCLOSED", url, tabId); 

    delete tabToUrl[tabId];

    // We prevent retroactive assinments on a no longer open log
    if (tabToLogID[tabId] == lastLogID) 
    {
        lastLogID = null;
    }

    delete tabToLogID[tabId];
});

// Captures web request event
// chrome.webNavigation.onCompleted.addListener(async function (activeInfo) {
//     // await handleTimerEvent();
//     await chrome.tabs.get(activeInfo.tabId, async function (tab) {
//         const time = new Date()

//         if (lastWebRQ == tab.url) return;
//         lastWebRQ = tab.url
        
//         const url = processUrl(tab.url);

//         // console.log("WEBREQUEST " + time.getTime() + " " + tab.url + " " + activeInfo.tabId);
//         await handleAddLogs(uid, time.getTime(), "WEBREQUEST", tab.url, activeInfo.tabId);
//     });
// });

