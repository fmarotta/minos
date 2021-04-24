const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const {GoogleAuth} = require('google-auth-library');
const {workDir} = require("./secret.js")

function addEvents(calId, payload) {
  const auth = new GoogleAuth({
    keyFile: workDir + 'service_key.json',
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({version: 'v3', auth});
  payload.forEach((e, i) => {
    setTimeout(() => {
      calendar.events.insert({
        auth: auth,
        calendarId: calId,
        resource: e
      }, function(err, event) {
        if (err) {
          console.log("There was an error contacting the Calendar service: " + err);
          return;
        }
      });
    }, i * 1000);
  });
}

exports.addEvents = addEvents
