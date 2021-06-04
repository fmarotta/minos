const fs = require('fs');
const {google} = require('googleapis');
const {GoogleAuth} = require('google-auth-library');
const {workDir} = require("./secret.js")

/* test
const auth = new GoogleAuth({
  keyFile: workDir + 'service_key.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({version: 'v3', auth});
calendar.events.list({
  auth: auth,
  calendarId: '7vrlsjcmflqim1setaermloa9c@group.calendar.google.com',
  maxResults: 10,
  singleEvents: true,
  orderBy: 'startTime',
}, (err, res) => {
    if (err) return console.log(err)
    const events = res.data.items
    if (events.length) {
      events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
        console.log(`${start} - ${event.summary}`);
      });
    } else {
      console.log('No upcoming events found.')
    }
})
*/

function addEvents(calId, payload) {
  const auth = new GoogleAuth({
    keyFile: workDir + 'service_key.json',
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({version: 'v3', auth});
  payload.forEach((e, i) => {
    setTimeout(() => {
      console.log(e)
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
