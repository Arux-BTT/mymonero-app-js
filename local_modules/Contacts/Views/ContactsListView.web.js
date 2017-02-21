// Copyright (c) 2014-2017, MyMonero.com
//
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are
// permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
//	conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice, this list
//	of conditions and the following disclaimer in the documentation and/or other
//	materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its contributors may be
//	used to endorse or promote products derived from this software without specific
//	prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
// THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
// STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
// THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
"use strict"
//
const View = require('../../Views/View.web')
const ListView = require('../../Lists/Views/ListView.web')
const commonComponents_navigationBarButtons = require('../../WalletAppCommonComponents/navigationBarButtons.web')
const commonComponents_emptyScreens = require('../../WalletAppCommonComponents/emptyScreens.web')
//
const ContactsListCellView = require('./ContactsListCellView.web')
const ContactDetailsView = require('./ContactDetailsView.web')
//
const AddContactFromContactsTabView = require('./AddContactFromContactsTabView.web')
const StackAndModalNavigationView = require('../../StackNavigation/Views/StackAndModalNavigationView.web')
//
class ContactsListView extends ListView
{
	constructor(options, context)
	{
		options.listController = context.contactsListController
		// ^- injecting dep so consumer of self doesn't have to
		super(options, context)
	}
	overridable_listCellViewClass()
	{ // override and return youir 
		return ContactsListCellView
	}
	overridable_pushesDetailsViewOnCellTap()
	{
		return true
	}
	overridable_recordDetailsViewClass()
	{
		return ContactDetailsView
	}
	_setup_views()
	{
		const self = this
		super._setup_views()
		self._setup_emptyStateContainerView()
	}
	_setup_emptyStateContainerView()
	{
		const self = this
		const view = new View({}, self.context)
		self.emptyStateContainerView = view
		const layer = view.layer
		const margin_side = 15
		const marginTop = 54 - 44
		layer.style.marginTop = `${marginTop}px`
		layer.style.marginLeft = margin_side + "px"
		layer.style.width = `calc(100% - ${2 * margin_side}px)`
		layer.style.height = `calc(100% - ${marginTop + 10}px)`
		{
			const emptyStateMessageContainerView = commonComponents_emptyScreens.New_EmptyStateMessageContainerView(
				"😬", 
				"You haven't created any<br/>contacts yet.",
				self.context,
				0
			)
			self.emptyStateMessageContainerView = emptyStateMessageContainerView
			view.addSubview(emptyStateMessageContainerView)
		}
		view.SetVisible = function(isVisible)
		{
			view.isVisible = isVisible
			if (isVisible) {
				if (layer.style.display !== "block") {
					layer.style.display = "block"
				}
			} else {
				if (layer.style.display !== "none") {
					layer.style.display = "none"
				}
			}
		}
		view.SetVisible(false)
		self.addSubview(view)
	}
	//
	//
	// Runtime - Accessors - Navigation
	//
	Navigation_Title()
	{
		return "Contacts"
	}
	Navigation_New_RightBarButtonView()
	{
		const self = this
		const view = commonComponents_navigationBarButtons.New_RightSide_AddButtonView(self.context)
		view.layer.addEventListener(
			"click",
			function(e)
			{
				e.preventDefault()
				{
					const view = new AddContactFromContactsTabView({}, self.context)
					const navigationView = new StackAndModalNavigationView({}, self.context)
					navigationView.SetStackViews([ view ])
					self.navigationController.PresentView(navigationView, true)
				}
				return false
			}
		)
		return view
	}
	//
	//
	// Runtime - Delegation - UI building
	//
	overridable_willBuildUIWithRecords(records)
	{
		super.overridable_willBuildUIWithRecords(records)
		//
		const self = this
		// v--- we don't need this here as at present according to design the buttons don't change… just stays the 'Add' btn
		// self.navigationController.SetNavigationBarButtonsNeedsUpdate(false) // explicit: no animation
		self.emptyStateContainerView.SetVisible(records.length === 0 ? true : false)
	}
}
module.exports = ContactsListView
