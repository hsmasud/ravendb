/// <reference path="../../Scripts/typings/bootstrap/bootstrap.d.ts" />

import router = require("plugins/router");
import app = require("durandal/app");
import sys = require("durandal/system");

import database = require("models/database");
import raven = require("common/raven");
import document = require("models/document");
import collection = require("models/collection");
import deleteDocuments = require("viewmodels/deleteDocuments");
import dialogResult = require("common/dialogResult");
import alertArgs = require("common/alertArgs");
import alertType = require("common/alertType");
import pagedList = require("common/pagedList");

class shell {
	private router = router;
	databases = ko.observableArray<database>();
	activeDatabase = ko.observable<database>().subscribeTo("ActivateDatabase");
	ravenDb: raven;
	currentAlert = ko.observable<alertArgs>();
    queuedAlerts = ko.observableArray<alertArgs>();
    databasesLoadedTask: JQueryPromise<any>;

	constructor() {
		this.ravenDb = new raven();
		ko.postbox.subscribe("EditDocument", args => this.launchDocEditor(args.doc.getId(), args.docsList));
        ko.postbox.subscribe("Alert", (alert: alertArgs) => this.showAlert(alert));
        ko.postbox.subscribe("ActivateDatabaseWithName", (databaseName: string) => this.activateDatabase(databaseName));
	}

	databasesLoaded(databases) {
		var systemDatabase = new database("<system>");
		systemDatabase.isSystem = true;
		this.databases(databases.concat([systemDatabase]));
		this.databases()[0].activate();
	}

    launchDocEditor(docId?: string, docsList?: pagedList) {
        var databaseUrlPart = this.activeDatabase() ? "&database=" + encodeURIComponent(this.activeDatabase().name) : "";
        var docIdUrlPart = docId ? "&id=" + encodeURIComponent(docId) + databaseUrlPart : "";
        var pagedListInfo = docsList && docsList.collectionName ? "&list=" + docsList.collectionName + "&item=" + docsList.currentItemIndex() : "";
        router.navigate("edit?" + docIdUrlPart + databaseUrlPart + pagedListInfo);
	}

	activate() {

		router.map([
			{ route: '', title: 'Databases', moduleId: 'viewmodels/databases', nav: false },
			{ route: 'documents', title: 'Documents', moduleId: 'viewmodels/documents', nav: true },
			{ route: 'indexes', title: 'Indexes', moduleId: 'viewmodels/indexes', nav: true },
			{ route: 'query', title: 'Query', moduleId: 'viewmodels/query', nav: true },
			{ route: 'tasks', title: 'Tasks', moduleId: 'viewmodels/tasks', nav: true },
			{ route: 'settings', title: 'Settings', moduleId: 'viewmodels/settings', nav: true },
			{ route: 'status', title: 'Status', moduleId: 'viewmodels/status', nav: true },
			{ route: 'edit', title: 'Edit Document', moduleId: 'viewmodels/editDocument', nav: false }
		]).buildNavigationModel();

		this.connectToRavenServer();
	}

	// The view must be attached to the DOM before we can hook up keyboard shortcuts.
	attached() {
		jwerty.key("alt+n", e => {
			e.preventDefault();
			this.newDocument();
		});
	}

	connectToRavenServer() {
        this.databasesLoadedTask = this.ravenDb
			.databases()
			.fail(result => this.handleRavenConnectionFailure(result))
			.done(results => {
				this.databasesLoaded(results);
				router.activate();
			});
	}

	handleRavenConnectionFailure(result) {
		sys.log("Unable to connect to Raven.", result);
		var tryAgain = 'Try again';
		var messageBoxResultPromise = app.showMessage("Couldn't connect to Raven. Details in the browser console.", ":-(", [tryAgain]);
		messageBoxResultPromise.done(messageBoxResult => {
			if (messageBoxResult === tryAgain) {
				this.connectToRavenServer();
			}
		});
	}

	showAlert(alert: alertArgs) {
		var currentAlert = this.currentAlert();
		if (currentAlert) {
			// Maintain a 500ms time between alerts; otherwise successive alerts can fly by too quickly.
			this.queuedAlerts.push(alert);
			if (currentAlert.type !== alertType.danger) {
				setTimeout(() => this.closeAlertAndShowNext(this.currentAlert()), 500);
			}
		} else {
			this.currentAlert(alert);
			var fadeTime = 3000;
			if (alert.type === alertType.danger || alert.type === alertType.warning) {
				fadeTime = 5000;
			}
			setTimeout(() => this.closeAlertAndShowNext(alert), fadeTime);
		}
	}

	closeAlertAndShowNext(alertToClose: alertArgs) {
		$('#' + alertToClose.id).alert('close');
		var nextAlert = this.queuedAlerts.pop();
		setTimeout(() => this.currentAlert(nextAlert), 500); // Give the alert a chance to fade out before we push in the new alert.
	}

	newDocument() {
		this.launchDocEditor(null);
    }

    activateDatabase(databaseName: string) {
        if (this.databasesLoadedTask) {
            this.databasesLoadedTask.done(() => {
                var matchingDatabase = this.databases().first(d => d.name == databaseName);
                if (matchingDatabase && this.activeDatabase() !== matchingDatabase) {
                    ko.postbox.publish("ActivateDatabase", matchingDatabase);
                }
            });
        }
    }
}

export = shell;