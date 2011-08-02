/*global console MyError dojo dojox dijit umc */

dojo.provide("umc.widgets.Page");

dojo.require("dijit.layout.BorderContainer");
dojo.require("umc.app");
dojo.require("umc.render");
dojo.require("umc.widgets.Text");

dojo.declare("umc.widgets.Page", dijit.layout.BorderContainer, {
	// summary:
	//		Class that abstracts a displayable page for a module.
	//		Offers the possibility to enter a help text that is shown or not
	//		depending on the user preferences.
	//		The widget itself is also a container such that children widgets
	//		may be adde via the 'addChild()' method.

	// helpText: String
	//		Text that describes the module, will be displayed at the top of a page.
	helpText: '',

	// headerText: String
	//		Text that will be displayed as header title.
	headerText: '&lt;Title missing&gt;',

	// footer: Object[]?
	//		Optional array of dicts that describes buttons that shall be added
	//		to the footer. The default button will be displayed on the right
	footerButtons: null,

	// title: String
	//		Title of the page. This option is necessary for tab pages.
	title: '',

	gutters: false,

	//style: 'width: 100%; height: 100%;',

	_helpTextPane: null,
	_helpTextShown: true,
	_subscriptionHandle: null,
	_footer: null,

	postMixInProperties: function() {
		this.inherited(arguments);

		// remove title from the attributeMap
		delete this.attributeMap.title;

		// get user preferences for the module helpText
		this._helpTextShown = umc.tools.preferences('moduleHelpText');
	},

	buildRendering: function() {
		this.inherited(arguments);

		// add the header
		this.addChild(new umc.widgets.Text({
			content: '<h1>' + this.headerText + '</h1>',
			region: 'top',
			'class': 'umcPageHeader'
		}));

		// put the help text in a Text widget and then add it to the container
		this._helpTextPane = new umc.widgets.Text({
			content: this.helpText || '',
			region: 'top',
			'class': 'umcPageHelpText'
		});
		this.addChild(this._helpTextPane);

		// hide the help text if specified
		if (!this._helpTextShown) {
			dojo.style(this._helpTextPane.domNode, {
				opacity: 0,
				display: 'none'
			});
		}

		// create the footer container(s)
		this._footer = new umc.widgets.ContainerWidget({
			region: 'bottom',
			'class': 'umcPageFooter'
		});
		this.addChild(this._footer);
		var footerLeft = new umc.widgets.ContainerWidget({
			style: 'float: left'
		});
		this._footer.addChild(footerLeft);
		var footerRight = new umc.widgets.ContainerWidget({
			style: 'float: right'
		});
		this._footer.addChild(footerRight);

		// render all buttons and add them to the footer
		if (this.footerButtons && dojo.isArray(this.footerButtons) && this.footerButtons.length) {
			var buttons = umc.render.buttons(this.footerButtons);
			dojo.forEach(buttons._order, function(ibutton) {
				if ('submit' == ibutton.type) {
					footerRight.addChild(ibutton);
				}
				else {
					footerLeft.addChild(ibutton);
				}
			}, this);
		}
	},

	postCreate: function() {
		this.inherited(arguments);

		// register for events to hide the help text information
		this._subscriptionHandle = dojo.subscribe('/umc/preferences/moduleHelpText', dojo.hitch(this, function(show) {
			if (false === show) {
				this.hideDescription();
			}
			else {
				this.showDescription();
			}
		}));
	},

	uninitialize: function() {
		// unsubscribe upon destruction
		dojo.unsubscribe(this._subscriptionHandle);
	},

	addChild: function(child) {
		// use 'center' as default region
		if (!child.region) {
			child.region = 'center';
		}
		this.inherited(arguments);
	},

	showDescription: function() {
		// if we don't have a help text, ignore call
		if (!this._helpTextPane || this._helpTextShown) {
			return;
		}

		// make the node transparent, yet displayable
		dojo.style(this._helpTextPane.domNode, {
			opacity: 0,
			display: 'block'
		});
		this._helpTextShown = true;
		this.layout();

		// fade in the help text
		dojo.fadeIn({
			node: this._helpTextPane.domNode,
			duration: 500
		}).play();

	},

	hideDescription: function() {
		// if we don't have a help text or the help text is already hidden, ignore call
		if (!this._helpTextPane || !this._helpTextShown) {
			return;
		}

		// fade out the help text
		dojo.fadeOut({
			node: this._helpTextPane.domNode,
			duration: 500,
			onEnd: dojo.hitch(this, function() {
				this._helpTextShown = false;
				dojo.style(this._helpTextPane.domNode, {
					display: 'none'
				});
				this.layout();
			})
		}).play();

	}
});


