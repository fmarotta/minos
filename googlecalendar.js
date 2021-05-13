const {google} = require('googleapis');
const {GoogleAuth} = require('google-auth-library');

const auth = new GoogleAuth({
  keyFile: __dirname + '/googlekey.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

function addEvents(calId, events) {
  const calendar = google.calendar({version: 'v3', auth});
  events.forEach((e, i) => {
    let sleep = ms => new Promise(resolve => setTimeout(resolve, i * 1000));
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
  });
}

exports.addEvents = addEvents;
