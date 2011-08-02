/*global dojo dijit dojox umc console window */

dojo.provide('umc.app');

dojo.require("dijit.Menu");
dojo.require("dijit.form.Button");
dojo.require("dijit.form.DropDownButton");
dojo.require("dijit.layout.BorderContainer");
dojo.require("dijit.layout.TabContainer");
dojo.require("dojo.cookie");
dojo.require("dojox.html.styles");
dojo.require("dojox.timing");
dojo.require("umc.tools");
dojo.require("umc.dialog");
dojo.require("umc.widgets.CategoryPane");
dojo.require("umc.widgets.ContainerWidget");
dojo.require("umc.widgets.Page");
dojo.require("umc.widgets.Text");
dojo.require("umc.i18n");

dojo.mixin(umc.app, new umc.i18n.Mixin({
	// use the framework wide translation file
	i18nClass: 'umc.app'
}), {
	_checkSessionTimer: null,

	// username: String
	//		The username of the authenticated user.
	username: null,

	// hostname: String
	//		The hostname on which the UMC is running.
	hostname: '',

	// domainname: String
	//		The domainname on which the UMC is running.
	domainname: '',

	start: function() {
		// create a background process that checks each second the validity of the session
		// cookie as soon as the session is invalid, the login screen will be shown
		this._checkSessionTimer = new dojox.timing.Timer(1000);
		this._checkSessionTimer.onTick = dojo.hitch(this, function() {
			if (!dojo.isString(dojo.cookie('UMCSessionId'))) {
				this.login();
			}
		});

		// check whether we still have a app cookie
		var sessionCookie = dojo.cookie('UMCSessionId');
		if (undefined === sessionCookie) {
			this.login();
		}
		else {
			this.onLogin(dojo.cookie('UMCUsername'));
			console.log(this._('Login is still valid (cookie: %(cookie)s, username: %(user)s).', { cookie: sessionCookie, user: this.username }));
		}
	},

	closeSession: function() {
		dojo.cookie('UMCSessionId', null, {
			expires: -1,
			path: '/'
		});
	},

	login: function() {
		// summary:
		//		Show the login dialog.
		this._checkSessionTimer.stop();
		umc.dialog.login().then(dojo.hitch(this, 'onLogin'));
	},

	onLogin: function(username) {
		// save the username internally and as cookie
		dojo.cookie('UMCUsername', username, { expires: 100, path: '/' });
		this.username = username;

		// restart the timer for session checking
		this._checkSessionTimer.start();
		umc.tools.umcpCommand('set', {
			locale: dojo.locale
		} ).then( dojo.hitch( this, function( data ) {
			this.loadModules();
		} ) );
	},

	// _tabContainer:
	//		Internal reference to the TabContainer object
	_tabContainer: null,

	openModule: function(/*String|Object*/ module, /*String?*/ flavor, /*Object?*/ props) {
		// summary:
		//		Open a new tab for the given module.
		// module:
		//		Module ID as string
		// props:
		//		Optional properties that are handed over to the module constructor.

		// get the object in case we have a string
		if (typeof(module) == 'string') {
			module = this.getModule(module, flavor);
		}
		if (undefined === module) {
			return;
		}

		// create a new tab
		var params = dojo.mixin({
			title: module.name,
			iconClass: umc.tools.getIconClass(module.icon),
			closable: true,
			moduleFlavor: module.flavor,
			moduleID: module.id,
			description: module.description
			//items: [ new module.BaseClass() ],
			//layout: 'fit',
			//closable: true,
			//autoScroll: true
			//autoWidth: true,
			//autoHeight: true
		}, props);
		var tab = new module.BaseClass(params);
		tab.startup();
		this._tabContainer.addChild(tab);
		this._tabContainer.selectChild(tab, true);
	},

	onModulesLoaded: function() {
		this.setupGui();
	},

	_modules: [],
	_categories: [],
	_modulesLoaded: false,
	loadModules: function() {
		// make sure that we don't load the modules twice
		if (this._modulesLoaded) {
			this.onModulesLoaded();
			return;
		}

		umc.tools.umcpCommand('get/modules/list').then(dojo.hitch(this, function(data) {
			// get all categories
			dojo.forEach(dojo.getObject('categories', false, data), dojo.hitch(this, function(icat) {
				this._categories.push(icat);
			}));

			// hack a specific order
			//TODO: remove this hack
			//var cats1 = [];
			//var cats2 = this._categories;
			//dojo.forEach(['favorites', 'ucsschool'], function(id) {
			//	var tmpCats = cats2;
			//	cats2 = [];
			//	dojo.forEach(tmpCats, function(icat) {
			//		if (id == icat.id) {
			//			cats1.push(icat);
			//		}
			//		else {
			//			cats2.push(icat);
			//		}
			//	});
			//});
			//this._categories = cats1.concat(cats2);
			//console.log(cats1);
			//console.log(cats2);
			//console.log(this._categories);
			// end of hack :)

			// get all modules
			dojo.forEach(dojo.getObject('modules', false, data), dojo.hitch( this, function(module) {
				// try to load the module
				try {
					dojo['require']('umc.modules.' + module.id);
				}
				catch (error) {
					// log as warning and continue with the next element in the list
					console.log('WARNING: Loading of module ' + module.id + ' failed. Ignoring it for now!');
					return true;
				}

				// load the module
				// add module config class to internal list of available modules
				this._modules.push(dojo.mixin({
					BaseClass: dojo.getObject('umc.modules.' + module.id)
				}, module));
			}));

			// loading is done
			this.onModulesLoaded();
			this._modulesLoaded = true;
		}));
	},

	getModules: function(/*String?*/ category) {
		// summary:
		//		Get modules, either all or the ones for the specific category.
		//		The returned array contains objects with the properties
		//		{ BaseClass, id, title, description, categories }.
		// categoryID:
		//		Optional category name.

		var modules = this._modules;
		if (undefined !== category) {
			// find all modules with the given category
			modules = [];
			for (var imod = 0; imod < this._modules.length; ++imod) {
				// iterate over all categories for the module
				var categories = this._modules[imod].categories;
				for (var icat = 0; icat < categories.length; ++icat) {
					// check whether the category matches the query
					if (category == categories[icat]) {
						modules.push(this._modules[imod]);
						break;
					}
				}
			}
		}

		// return all modules
		return modules; // Object[]
	},

	getModule: function(/*String*/ id, /*String?*/ flavor) {
		// summary:
		//		Get the module object for a given module ID.
		//		The returned object has the following properties:
		//		{ BaseClass, id, description, category, flavor }.
		// id:
		//		Module ID as string.
		// flavor:
		//		The module flavor as string.

		var i;
		for (i = 0; i < this._modules.length; ++i) {
			if (!flavor && this._modules[i].id == id) {
				// flavor is not given, we matched only the module ID
				return this._modules[i]; // Object
			}
			else if (flavor && this._modules[i].id == id && this._modules[i].flavor == flavor) {
				// flavor is given, module ID as well as flavor matched
				return this._modules[i]; // Object
			}
		}
		return undefined; // undefined
	},

	getCategories: function() {
		// summary:
		//		Get all categories as an array. Each entry has the following properties:
		//		{ id, description }.
		return this._categories; // Object[]
	},

	_isSetupGUI: false,
	setupGui: function() {
		// make sure that we have not build the GUI before
		if (this._isSetupGUI) {
			return;
		}

		// set up fundamental layout parts
		var topContainer = new dijit.layout.BorderContainer( {
			'class': 'umcTopContainer',
			gutters: false
		}).placeAt(dojo.body());

		// container for all modules tabs
		this._tabContainer = new dijit.layout.TabContainer({
			region: 'center'
		});
		topContainer.addChild(this._tabContainer);

		// the container for all category panes
		// NOTE: We add the icon here in the first tab, otherwise the tab heights
		//	   will not be computed correctly and future tabs will habe display
		//	   problems.
		//     -> This could probably be fixed by calling layout() after adding a new tab!
		var overviewPage = new umc.widgets.Page({
			title: this._('Overview'),
			headerText: this._('Overview'),
			iconClass: umc.tools.getIconClass('univention'),
			helpText: this._('Univention Management Console is a modularly designed, web-based application for the administration of objects in your Univention Corporate Server domain as well as individual of Univention Corporate Server systems.')
		});
		this._tabContainer.addChild(overviewPage);

		// add a CategoryPane for each category
		var categories = umc.widgets.ContainerWidget({
			scrollable: true
		});
		dojo.forEach(this.getCategories(), dojo.hitch(this, function(icat) {
			// ignore empty categories
			var modules = this.getModules(icat.id);
			if (0 === modules.length) {
				return;
			}

			// create a new category pane for all modules in the given category
			var categoryPane = new umc.widgets.CategoryPane({
				modules: modules,
				title: icat.name,
				open: true //('favorites' == icat.id)
			});

			// register to requests for opening a module
			dojo.connect(categoryPane, 'onOpenModule', dojo.hitch(this, this.openModule));

			// add category pane to overview page
			categories.addChild(categoryPane);
		}));
		overviewPage.addChild(categories);

		// the header
		var header = new umc.widgets.ContainerWidget({
			'class': 'umcHeader',
			region: 'top'
		});
		topContainer.addChild( header );

		// we need containers aligned to the left and the right
		var headerLeft = new umc.widgets.ContainerWidget({
			style: 'float: left'
		});
		header.addChild(headerLeft);
		var headerRight = new umc.widgets.ContainerWidget({
			style: 'float: right'
		});
		header.addChild(headerRight);

		// add some buttons
		headerLeft.addChild(new dijit.form.Button({
			label: this._('Help'),
			'class': 'umcHeaderButton'
		}));
		headerLeft.addChild(new dijit.form.Button({
			label: this._('About UMC'),
			'class': 'umcHeaderButton'
		}));

		// query domainname and hostname and add this information to the header
		var hostInfo = new dijit.form.Button({
			label: '...',
			'class': 'umcHeaderButton'
		});
		headerRight.addChild(hostInfo);
		umc.tools.umcpCommand('ucr/get', [ 'domainname', 'hostname' ]).
			then(dojo.hitch(this, function(data) {
				this.domainname = data.result[0].value;
				this.hostname = data.result[1].value;
				hostInfo.set('label', this._('Host: %(host)s.%(domain)s', {
					domain: this.domainname,
					host: this.hostname
				}));
			}));

		// the user context menu
		var menu = new dijit.Menu({});
		menu.addChild(new dijit.CheckedMenuItem({
			label: this._('Tooltips'),
			checked: umc.tools.preferences('tooltips'),
			onClick: dojo.hitch(this, function() {
				umc.tools.preferences('tooltips', this.checked);
			})
		}));
		menu.addChild(new dijit.CheckedMenuItem({
			label: this._('Confirmations'),
			checked: true,
			checked: umc.tools.preferences('confirm'),
			onClick: dojo.hitch(this, function() {
				umc.tools.preferences('confirm', this.checked);
			})
		}));
		menu.addChild(new dijit.CheckedMenuItem({
			label: this._('Module help description'),
			checked: true,
			checked: umc.tools.preferences('moduleHelpText'),
			onClick: function() {
				umc.tools.preferences('moduleHelpText', this.checked);
			}
		}));
		headerRight.addChild(new dijit.form.DropDownButton({
			label: this._('User: %s', this.username),
			'class': 'umcHeaderButton',
			dropDown: menu
		}));

		// add logout button
		headerRight.addChild(new dijit.form.Button({
			label: '<img src="images/logout.png">',
			'class': 'umcHeaderButton',
			onClick: dojo.hitch(this, function() {
				this.closeSession();
				window.location.reload();
			})
		}));

		// the footer
		var footer = new umc.widgets.ContainerWidget({
			'class': 'umcFooter',
			region: 'bottom'
		});
		topContainer.addChild(footer);

		// put everything together
		topContainer.startup();

		// subscribe to requests for opening modules
		dojo.subscribe('/umc/modules/open', dojo.hitch(this, 'openModule'));

		// set a flag that GUI has been build up
		this._isSetupGUI = true;
	}
});

