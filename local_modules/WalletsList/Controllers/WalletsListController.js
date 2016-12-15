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
const EventEmitter = require('events')
const async = require('async')
//
const SecretPersistingHostedWallet = require('../../Wallets/Models/SecretPersistingHostedWallet')
const secretWallet_persistence_utils = require('../../Wallets/Models/secretWallet_persistence_utils')
//
//
////////////////////////////////////////////////////////////////////////////////
// Principal class
//
class WalletsListController extends EventEmitter
{


	////////////////////////////////////////////////////////////////////////////////
	// Lifecycle - Initialization

	constructor(options, context)
	{
		super() // must call super before we can access `this`
		//
		const self = this
		self.options = options
		self.context = context
		//
		self.hasBooted = false // not booted yet - we'll defer things till we have
		//
		self.setup()
	}
	_setup_didBoot(optlFn)
	{
		const self = this
		optlFn = optlFn || function() {}
		//
		self.hasBooted = true // all done!
		setTimeout(function()
		{ // on next tick to avoid instantiator missing this
			self.emit(self.EventName_booted())
			optlFn()
		})
	}
	_setup_didFailToBootWithError(err)
	{
		const self = this
		setTimeout(function()
		{ // on next tick to avoid instantiator missing this
			self.emit(self.EventName_errorWhileBooting(), err)
		})
	}
	setup()
	{
		const self = this
		const context = self.context
		if (typeof context.persister === 'undefined') { // self should only be after persister in the context module load list
			throw "context.persister undefined in WalletsListController setup()"
		}
		//
		// reconsitute persisted wallets
		self._new_idsOfPersistedWallets(
			function(err, ids)
			{
				if (err) {
					const errStr = "Error fetching persisted wallet ids: " + err.toString()
					const err = new Error(errStr)
					self._setup_didFailToBootWithError(err)
					return
				}
				__proceedTo_loadWalletsWithIds(ids)
			}
		)
		function __proceedTo_loadWalletsWithIds(ids)
		{
			self.wallets = []
			if (ids.length === 0) { // do not cause the pw to be requested yet
				self._setup_didBoot()
				// and we don't want/need to emit that the list updated here
				return
			}
			self.context.passwordController.WhenBootedAndPasswordObtained_PasswordAndType( // this will block until we have access to the pw
				function(obtainedPasswordString, userSelectedTypeOfPassword)
				{
					__proceedTo_loadAndBootAllExtantWalletsWithPassword(obtainedPasswordString)
				}
			)
			function __proceedTo_loadAndBootAllExtantWalletsWithPassword(persistencePassword)
			{
				async.each(
					ids,
					function(_id, cb)
					{
						var wallet;
						const options =
						{
							_id: _id,
							//
							failedToInitialize_cb: function(err)
							{
								console.error("Failed to read wallet ", err)
								cb(err)
							},
							successfullyInitialized_cb: function()
							{
								wallet.Boot_decryptingExistingInitDoc(
									persistencePassword,
									function(err)
									{
										if (err) {
											cb(err)
											return
										}
										console.log("💬  Initialized wallet", wallet.Description())
										self.wallets.push(wallet) // we manually manage the list here and
										// thus take responsibility to emit EventName_listUpdated below
										self._startObserving_wallet(wallet) // taking responsibility to start observing
										//
										cb()
									}
								)
							},
							didReceiveUpdateToAccountInfo: function()
							{ // TODO: bubble?
							},
							didReceiveUpdateToAccountTransactions: function()
							{ // TODO: bubble?
							}
						}
						wallet = new SecretPersistingHostedWallet(options, context)
					},
					function(err)
					{
						if (err) {
							console.error("Error fetching persisted wallets", err)
							self._setup_didFailToBootWithError(err)
							return
						}
						self._setup_didBoot(function()
						{ // in cb to ensure serialization of calls
							self.__listUpdated_wallets() // emit after booting so this becomes an at-runtime emission
						})
					}
				)
			}
		}
	}
	

	////////////////////////////////////////////////////////////////////////////////
	// Lifecycle - Teardown
	
	_tearDown()
	{
		const self = this
		self._tearDown_wallets()
	}
	_tearDown_wallets()
	{
		const self = this
		const wallets_length = self.wallets.length
		for (let i = 0 ; i < wallets_length ; i++) {
			const wallet = self.wallets[i]
			wallet.TearDown()
		}
	}	


	////////////////////////////////////////////////////////////////////////////////
	// Booting/Booted - Accessors - Public - Events emitted

	EventName_booted()
	{
		return "EventName_booted"
	}
	EventName_errorWhileBooting()
	{
		return "EventName_errorWhileBooting"
	}
	EventName_listUpdated() // -> String
	{
		return "EventName_listUpdated"
	}
	//
	EventName_aWallet_balanceChanged()
	{
		return "EventName_aWallet_balanceChanged"
	}
	EventName_aWallet_transactionsAdded()
	{
		return "EventName_aWallet_transactionsAdded"
	}


	////////////////////////////////////////////////////////////////////////////////
	// Runtime - Accessors - Private - Lookups - Documents & instances

	_new_idsOfPersistedWallets(
		fn // (err?, ids?) -> Void
	)
	{
		const self = this
		self.context.persister.DocumentsWithQuery(
			secretWallet_persistence_utils.CollectionName,
			{}, // blank query - find all
			{},
			function(err, docs)
			{
				if (err) {
					console.error(err.toString)
					fn(err)
					return
				}
				const ids = []
				docs.forEach(function(el, idx)
				{
					ids.push(el._id)
				})
				fn(null, ids)
			}
		)
	}
	__walletInstanceAndIndexWithId(_id)
	{
		const self = this
		//
		const wallets_length = self.wallets.length
		var targetWallet_index = null
		var targetWallet_instance = null
		for (let i = 0 ; i < wallets_length ; i++) {
			const wallet = self.wallets[i]
			if (wallet._id === _id) {
				targetWallet_index = i
				targetWallet_instance = wallet
				break
			}
		}
		//
		return {
			index: targetWallet_index,
			instance: targetWallet_instance
		}
	}


	////////////////////////////////////////////////////////////////////////////////
	// Runtime - Accessors - Private - Factories - Properties

	_new_autogeneratedWalletLabel()
	{
		const self = this
		if (self.wallets.length == 0) {
			return "My First Wallet"
		}
		return "Untitled Wallet" // TODO: maybe pick from a list of funny/apt names, e.g. "Savings", "Piggy Bank", etc
	}


	////////////////////////////////////////////////////////////////////////////////
	// Booted - Accessors - Public

	WhenBooted_Wallets(fn)
	{
		const self = this
		self.ExecuteWhenBooted(
			function()
			{
				fn(self.wallets)
			}
		)
	}


	////////////////////////////////////////////////////////////////////////////////
	// Runtime - Imperatives - Public - Deferring control til boot

	ExecuteWhenBooted(fn)
	{
		const self = this
		if (self.hasBooted === true) {
			fn()
			return
		}
		setTimeout(
			function()
			{
				self.ExecuteWhenBooted(fn)
			},
			50 // ms
		)
	}


	////////////////////////////////////////////////////////////////////////////////
	// Booted - Imperatives - Public - Wallets list

	WhenBooted_CreateAndAddNewlyGeneratedWallet(
		informingAndVerifyingMnemonic_cb, // informingAndVerifyingMnemonic_cb: (mnemonicString, confirmation_cb) -> Void
										    // confirmation_cb: (userConfirmed_mnemonicString) -> Void
		fn // fn: (err: Error?, walletInstance, SecretPersistingHostedWallet) -> Void
	)
	{
		const self = this
		const context = self.context
		self.ExecuteWhenBooted(
			function()
			{
				context.passwordController.WhenBootedAndPasswordObtained_PasswordAndType( // this will block until we have access to the pw
					function(obtainedPasswordString, userSelectedTypeOfPassword)
					{
						_proceedWithPassword(obtainedPasswordString)
					}
				)
				function _proceedWithPassword(persistencePassword)
				{
					var wallet;
					const options =
					{
						generateNewWallet: true, // must flip this flag to true
						//
						failedToInitialize_cb: function(err)
						{
							fn(err)
						},
						successfullyInitialized_cb: function()
						{
							const walletLabel = self._new_autogeneratedWalletLabel()
							wallet.Boot_byLoggingIntoHostedService_byCreatingNewWallet(
								persistencePassword,
								walletLabel,
								informingAndVerifyingMnemonic_cb,
								function(err)
								{
									if (err) {
										fn(err)
										return
									}
									self._atRuntime__wallet_wasSuccessfullyInitialized(wallet)
									//
									fn(null, wallet)
								}
							)
						},
						//
						didReceiveUpdateToAccountInfo: function()
						{ // TODO: bubble?
						},
						didReceiveUpdateToAccountTransactions: function()
						{ // TODO: bubble?
						}
					}
					wallet = new SecretPersistingHostedWallet(options, context)
				}
			}
		)
	}
	WhenBooted_AddExtantWalletWith_mnemonicString(
		mnemonicString,
		fn // fn: (err: Error?, walletInstance: SecretPersistingHostedWallet, wasWalletAlreadyInserted: Bool?) -> Void
	)
	{
		const self = this
		const context = self.context
		self.ExecuteWhenBooted(
			function()
			{
				context.passwordController.WhenBootedAndPasswordObtained_PasswordAndType( // this will block until we have access to the pw
					function(obtainedPasswordString, userSelectedTypeOfPassword)
					{
						_proceedWithPassword(obtainedPasswordString)
					}
				)
				function _proceedWithPassword(persistencePassword)
				{
					var walletAlreadyExists = false
					const wallets_length = self.wallets.length
					for (let i = 0 ; i < wallets_length ; i++) {
						const wallet = self.wallets[i]
						if (wallet.mnemonicString === mnemonicString) {
							// simply return existing wallet
							fn(null, wallet, true) // wasWalletAlreadyInserted: true
							return
						}
						// TODO: solve limitation of this code; how to check if wallet with same address (but no mnemonic) was already added?
					}
					//
					var wallet;
					const options =
					{
						failedToInitialize_cb: function(err)
						{
							fn(err)
						},
						successfullyInitialized_cb: function()
						{
							const walletLabel = self._new_autogeneratedWalletLabel()
							wallet.Boot_byLoggingIntoHostedService_withMnemonic(
								persistencePassword,
								walletLabel,
								mnemonicString,
								function(err) {
									if (err) {
										fn(err)
										return
									}
									self._atRuntime__wallet_wasSuccessfullyInitialized(wallet)
									//
									fn(null, wallet, false) // wasWalletAlreadyInserted: false
								}
							)
						},
						//
						didReceiveUpdateToAccountInfo: function()
						{ // TODO: bubble?
						},
						didReceiveUpdateToAccountTransactions: function()
						{ // TODO: bubble?
						}
					}
					wallet = new SecretPersistingHostedWallet(options, context)
				}
			}
		)
	}
	WhenBooted_AddExtantWalletWith_addressAndKeys(
		address,
		view_key__private,
		spend_key__private,
		fn // fn: (err: Error?, walletInstance: SecretPersistingHostedWallet, wasWalletAlreadyInserted: Bool?) -> Void
	)
	{
		const self = this
		const context = self.context
		self.ExecuteWhenBooted(
			function()
			{
				context.passwordController.WhenBootedAndPasswordObtained_PasswordAndType( // this will block until we have access to the pw
					function(obtainedPasswordString, userSelectedTypeOfPassword)
					{
						_proceedWithPassword(obtainedPasswordString)
					}
				)
				function _proceedWithPassword(persistencePassword)
				{
					var walletAlreadyExists = false
					const wallets_length = self.wallets.length
					for (let i = 0 ; i < wallets_length ; i++) {
						const wallet = self.wallets[i]
						if (wallet.public_address === address) {
							// simply return existing wallet; note: this wallet might have mnemonic and thus seed
							// so might not be exactly what consumer of WhenBooted_AddExtantWalletWith_addressAndKeys is expecting
							fn(null, wallet, true) // wasWalletAlreadyInserted: true
							return
						}
					}
					//
					var wallet;
					const options =
					{
						failedToInitialize_cb: function(err)
						{
							fn(err)
						},
						successfullyInitialized_cb: function()
						{
							const walletLabel = self._new_autogeneratedWalletLabel()
							wallet.Boot_byLoggingIntoHostedService_withAddressAndKeys(
								persistencePassword,
								walletLabel,
								address,
								view_key__private,
								spend_key__private,
								function(err)
								{
									if (err) {
										fn(err)
										return
									}
									self._atRuntime__wallet_wasSuccessfullyInitialized(wallet)
									//
									fn(null)
								}
							)
						},
						//
						didReceiveUpdateToAccountInfo: function()
						{ // TODO: bubble?
						},
						didReceiveUpdateToAccountTransactions: function()
						{ // TODO: bubble?
						}
					}
					wallet = new SecretPersistingHostedWallet(options, context)
				}
			}
		)
	}
	//
	WhenBooted_DeleteWalletWithId(
		_id,
		fn
	)
	{
		const self = this
		//
		self.ExecuteWhenBooted(
			function()
			{
				const instanceAndIndex = self.__walletInstanceAndIndexWithId(_id)
				var indexOfWallet = instanceAndIndex.index
				var walletInstance = instanceAndIndex.instance
				if (indexOfWallet === null || walletInstance === null) {
					fn(new Error("Wallet not found"))
					return
				}
				//
				self._stopObserving_wallet(walletInstance) // important
				self.wallets.splice(indexOfWallet, 1) // pre-emptively remove the wallet from the list
				self.__listUpdatedAtRuntime_wallets() // ensure delegate notified
				//
				walletInstance.Delete(
					function(err)
					{
						if (err) {
							self.wallets.splice(indexOfWallet, 0, walletInstance) // revert deletion
							self._atRuntime__wallet_wasSuccessfullyInitialized() // ensure delegate notified
							fn(err)
							return
						}
						walletInstance = null // 'free'
						fn()
					}
				)
			}
		)
	}
	
	
	////////////////////////////////////////////////////////////////////////////////
	// Runtime - Delegation - Post-instantiation hook
	
	RuntimeContext_postWholeContextInit_setup()
	{
		const self = this
	}


	////////////////////////////////////////////////////////////////////////////////
	// Runtime - Imperatives - Private - Event observation - Wallets
	
	_startObserving_wallet(wallet)
	{
		const self = this
		// we need to be able to stop observing a wallet when the user deletes it (as we free the wallet),
		// so we (stupidly) have to hang onto the listener function
		{ // balanceChanged
			if (typeof self.wallet_listenerFnsByWalletId_balanceChanged === 'undefined') {
				self.wallet_listenerFnsByWalletId_balanceChanged = {}
			}		
			const fn = function(emittingWallet, old_total_received, old_total_sent, old_locked_balance)
			{
				self.emit(self.EventName_aWallet_balanceChanged(), emittingWallet, old_total_received, old_total_sent, old_locked_balance)
			}
			self.wallet_listenerFnsByWalletId_balanceChanged[wallet._id] = fn
			wallet.on(wallet.EventName_balanceChanged(), fn)
		}
		{ // transactionsAdded
			if (typeof self.wallet_listenerFnsByWalletId_transactionsAdded === 'undefined') {
				self.wallet_listenerFnsByWalletId_transactionsAdded = {}
			}		
			const fn = function(emittingWallet, numberOfTransactionsAdded, newTransactions)
			{
				self.emit(self.EventName_aWallet_transactionsAdded(), emittingWallet, numberOfTransactionsAdded, newTransactions)
			}
			self.wallet_listenerFnsByWalletId_transactionsAdded[wallet._id] = fn
			wallet.on(wallet.EventName_transactionsAdded(), fn)
		}
	}
	_stopObserving_wallet(wallet)
	{
		const self = this
		{ // balanceChanged
			const fn = self.wallet_listenerFnsByWalletId_balanceChanged[wallet._id]
			if (typeof fn === 'undefined') {
				throw "listener shouldn't have been undefined"
			}
			wallet.removeListener(wallet.EventName_balanceChanged(), fn)
		}
		{ // transactionsAdded
			const fn = self.wallet_listenerFnsByWalletId_transactionsAdded[wallet._id]
			if (typeof fn === 'undefined') {
				throw "listener shouldn't have been undefined"
			}
			wallet.removeListener(wallet.EventName_transactionsAdded(), fn)
		}
	}
	

	////////////////////////////////////////////////////////////////////////////////
	// Runtime/Boot - Delegation - Private - List updating/instance management

	_atRuntime__wallet_wasSuccessfullyInitialized(walletInstance)
	{
		const self = this
		self.wallets.push(walletInstance)
		self._startObserving_wallet(wallet)
		self.__listUpdated_wallets()
	}
	__listUpdated_wallets()
	{
		const self = this
		self.emit(self.EventName_listUpdated())
	}


	////////////////////////////////////////////////////////////////////////////////
	// Runtime/Boot - Delegation - Private
	
}
module.exports = WalletsListController