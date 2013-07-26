Components.utils.import("resource://gre/modules/Services.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cm = Components.manager;

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const MY_URL = "resource://visual-event-tracer-addon/";

/**
 * Get the app's name so we can properly dispatch app-specific
 * methods per API call
 * @returns Gecko application name
 */
function appName()
{
  let APP_ID = Services.appinfo.QueryInterface(Ci.nsIXULRuntime).ID;

  let APP_ID_TABLE = {
    "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}": "FIREFOX" ,
    "{3550f703-e582-4d05-9a08-453d09bdfdc6}": "THUNDERBIRD",
    "{a23983c0-fd0e-11dc-95ff-0800200c9a66}": "FENNEC" ,
    "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}": "SEAMONKEY",
  };

  let name = APP_ID_TABLE[APP_ID];

  if (name) {
    return name;
  }
  throw new Error("appName: UNSUPPORTED APPLICATION UUID");
}


Cm.QueryInterface(Ci.nsIComponentRegistrar);

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function AboutTimeline() {}

AboutTimeline.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
  classDescription: "about:timeline",
  classID: Components.ID("{52fdb47b-b8a4-4932-a785-6bef155c8782}"),
  contractID: "@mozilla.org/network/protocol/about;1?what=timeline",
  
  newChannel: function(uri)
  {
    switch (uri.ref) {
      case "log":
      try {
        var VETService = Cc["@mozilla.org/base/visual-event-tracer;1"].getService(Ci.nsIVisualEventTracer);

        var stringStream = Cc["@mozilla.org/io/string-input-stream;1"].
                           createInstance(Ci.nsIStringInputStream);
        stringStream.data = VETService.snapshot().JSONString;

        var channel = Cc['@mozilla.org/network/input-stream-channel;1'].
            createInstance(Ci.nsIInputStreamChannel);
        channel.contentStream = stringStream;

        channel.QueryInterface(Ci.nsIChannel);
        channel.setURI(uri);
        channel.originalURI = uri;
        return channel;
        } catch (exc) { dump(exc); } return null;

      case "":
        var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        var channel = ioService.newChannel(MY_URL + "resources/visualizer.html", null, null);
        var securityManager = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager);
        var principal = securityManager.getSystemPrincipal(uri);
        channel.originalURI = uri;
        channel.owner = principal;
        return channel;

      default:
        throw "Unknown #command";
    }
    // -- to download the log: 
  },

  getURIFlags: function(uri)
  {
    return 0; //Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT;
  }
}

const AboutTimelineFactory = XPCOMUtils.generateNSGetFactory([AboutTimeline])(AboutTimeline.prototype.classID);

var global = this;

function monkeyPatchWindow(w, loadedAlready) {
  let doIt = function () {
    let taskPopup = w.document.getElementById("taskPopup");

    // Check it's a mail:3pane
    if (!taskPopup)
      return;

    let menuitem = w.document.createElement("menuitem");
    menuitem.addEventListener("command", function () {
      w.document.getElementById("tabmail").openTab(
        "contentTab",
        { contentPage: "about:timeline" }
      );
    }, false);
    menuitem.setAttribute("label", "about:timeline");
    menuitem.setAttribute("id", "aboutVETMenuitem");
    taskPopup.appendChild(menuitem);
  };
  if (loadedAlready)
    doIt();
  else
    w.addEventListener("load", doIt, false);
}

function unMonkeyPatchWindow(w) {
  let menuitem = w.document.getElementById("aboutVETMenuitem");
  menuitem.parentNode.removeChild(menuitem);
}

function startup(aData, aReason) {
  let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  let alias = Services.io.newFileURI(aData.installPath);
  if (!aData.installPath.isDirectory())
    alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
  resource.setSubstitution("visual-event-tracer-addon", alias);

  // For Thunderbird, since there's no URL bar, we add a menu item to make it
  // more discoverable.
  if (appName() == "THUNDERBIRD") {
    // Thunderbird-specific JSM
    Cu.import("resource:///modules/iteratorUtils.jsm", global);

    // Patch all existing windows
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane"), Ci.nsIDOMWindow)) {
      // True means the window's been loaded already, so add the menu item right
      // away (the default is: wait for the "load" event).
      monkeyPatchWindow(w.window, true);
    }

    // Patch all future windows
    Services.ww.registerNotification({
      observe: function (aSubject, aTopic, aData) {
        if (aTopic == "domwindowopened") {
          aSubject.QueryInterface(Ci.nsIDOMWindow);
          monkeyPatchWindow(aSubject.window);
        }
      },
    });
  }

  // This throws when doing disable/enable, so leave it at the end...
  Cm.registerFactory(AboutTimeline.prototype.classID,
                     AboutTimeline.prototype.classDescription,
                     AboutTimeline.prototype.contractID,
                     AboutTimelineFactory);
}

function shutdown(aData, aReason) {
  if (aReason == APP_SHUTDOWN) return;

  let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  resource.setSubstitution("telemetry-addon", null);

  if (appName() == "THUNDERBIRD") {
    // Un-patch all existing windows
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane")))
      unMonkeyPatchWindow(w);
  }

  Cm.unregisterFactory(AboutTimeline.prototype.classID,
                       AboutTimelineFactory);
}
function install(aData, aReason) { }
function uninstall(aData, aReason) { }
