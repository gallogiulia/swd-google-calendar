/**
 * create-swd-forms.gs
 *
 * Creates the four Google Forms that replace the Squarespace form blocks on
 * swlawnbowls.org, each with its own linked response spreadsheet.
 *
 * HOW TO USE (once):
 *   1. Go to https://script.google.com and choose "New project".
 *   2. Delete whatever is in the editor and paste this whole file in.
 *   3. Press Run, and choose the function `createAllForms`.
 *   4. Google will ask permission to manage your Forms and Sheets - allow it.
 *   5. When it finishes, open View > Logs. It prints an EMBED URL for each form.
 *   6. Send those four URLs to Claude, which will drop them into the pages.
 *
 * Running this twice creates a SECOND set of forms. Run it once.
 *
 * The fields below were read off the live Squarespace pages, so the questions,
 * dropdown options and required/optional settings match what members see today.
 */

function createAllForms() {
  var made = [];

  made.push(buildForm("SWD — Contact Us", "Sends a general question or comment about the site or about lawn bowling to the Southwest Division.", [
    {"label": "Name", "kind": "text", "required": true},
    {"label": "Email", "kind": "email", "required": true},
    {"label": "Message", "kind": "paragraph", "required": true},
  ]));

  made.push(buildForm("SWD — Ladies’ Day Attendees Sign-up", "Registers a bowler (and optionally her team) for a specific Ladies’ Day event on the season schedule.", [
    {"label": "Name", "kind": "text", "required": true},
    {"label": "Email", "kind": "email", "required": true},
    {"label": "Club Name", "kind": "choice", "required": false, "options": ["BEVERLY HILLS LBC", "CAMBRIA LBC", "CASTA DEL SOL LBC", "CORONADO LBC", "FRIENDLY VALLEY LBC", "HERMOSA BEACH LBC", "HOLMBY PARK LBC", "LAGUNA BEACH LBC", "LAGUNA WOODS LBC", "LONG BEACH LBC", "MACKENZIE PARK LBC", "NEWPORT HARBOR LBC", "OAKS NORTH LBC", "OXNARD-JOSLYN LBC", "PALM DESERT LBC", "PASADENA LBC", "POMONA LBC", "REDLANDS LBC", "RIVERSIDE LBC", "SAN DIEGO LBC", "SANTA ANA LBC", "SANTA ANITA BOWLING GREEN", "SANTA BARBARA LBC", "SANTA MONICA LBC", "SUN CITY LBC", "THE GROVES LBC"]},
    {"label": "Please choose the Ladies' Day event you are signing up for from the dropdown menu", "kind": "choice", "required": true, "options": ["Wed. April 8 @ Newport Harbor", "Wed. May 13 @ Long Beach", "Wed. June 10 @ Hermosa Beach", "Wed. July 8 @ Newport Harbor", "Wed. Aug. 12 @ Laguna Beach", "Wed. Sept. 9 @ Santa Ana", "Wed. Oct. 14 @ Casta del Sol", "Wed. Nov. 11 @ The Groves", "Tues. Dec. 15 @ Laguna Woods (Luncheon)"]},
    {"label": "Please enter the name and positions of each player.", "kind": "paragraph", "required": false, "description": "Please use this space to enter each name of the players with their positions. i.e. Anne - Skip."},
  ]));

  made.push(buildForm("SWD — IE Ladies’ Day Sign-up", "Signs a bowler up for an Inland Empire Ladies’ Day event and records the position she wants to play.", [
    {"label": "Name", "kind": "text", "required": true},
    {"label": "Email", "kind": "email", "required": true},
    {"label": "Select an event from the dropdown:", "kind": "choice", "required": false, "options": ["July 11, 6:30pm at Riverside LBC"]},
    {"label": "Select position from the dropdown:", "kind": "choice", "required": false, "options": ["Skip", "Vice", "Lead", "Any Position"]},
  ]));

  made.push(buildForm("SWD — Bowls Development Fund", "Collects a name and email plus an indication of whether the person intends to donate to the Bowls Development Fund. It does not take money — donations are made on the Fund's own website.", [
    {"label": "Name", "kind": "text", "required": true},
    {"label": "Email", "kind": "email", "required": true},
    {"label": "Will you be donating?", "kind": "choice", "required": true, "options": ["Yes", "No", "Still Unsure"]},
  ]));


  Logger.log('\n================ COPY THE LINES BELOW ================\n');
  made.forEach(function (f) {
    Logger.log(f.title);
    Logger.log('  EMBED URL: ' + f.embedUrl);
    Logger.log('  Edit form: ' + f.editUrl);
    Logger.log('  Responses: ' + f.sheetUrl);
    Logger.log('');
  });
  Logger.log('=====================================================');
  return made;
}

/**
 * Builds one form plus its response sheet, and returns the URLs.
 */
function buildForm(title, description, fields) {
  var form = FormApp.create(title);
  form.setDescription(description);
  form.setCollectEmail(false);         // the form asks for email itself
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setConfirmationMessage(
    'Thank you - your response has been recorded. ' +
    'Southwest Bowls Division');

  fields.forEach(function (f) {
    var item;
    switch (f.kind) {
      case 'paragraph':
        item = form.addParagraphTextItem();
        break;
      case 'choice':
        item = form.addListItem();
        item.setChoiceValues(f.options || []);
        break;
      case 'email':
        item = form.addTextItem();
        item.setValidation(
          FormApp.createTextValidation()
            .setHelpText('Please enter a valid email address.')
            .requireTextIsEmail()
            .build());
        break;
      default:
        item = form.addTextItem();
    }
    item.setTitle(f.label);
    if (f.description) item.setHelpText(f.description);
    item.setRequired(!!f.required);
  });

  // Every form gets its own spreadsheet so responses are easy to read and share.
  var ss = SpreadsheetApp.create(title + ' (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  return {
    title: title,
    embedUrl: form.getPublishedUrl().replace('/viewform', '/viewform?embedded=true'),
    editUrl: form.getEditUrl(),
    sheetUrl: ss.getUrl()
  };
}
