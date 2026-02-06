// -*- mode: js; indent-tabs-mode: t; js-indent-level: 8 -*-
// file: duplicateEntriesWindowSearch.js
//
// Search position stepping and duplicate-find loop: searchPositionsToNext, skipPositionsToNext,
// runIntervalAction. ctx is the main window (DuplicateEntriesWindow).
// ctx must have: vcards, BOOK_1, BOOK_2, abId1, abId2, positionSearch, position1, position2,
// deferInteractive, nowHandling, positionDuplicates, duplicates, updateProgress, getSimplifiedCard,
// deleteAbCard, displayCardData, endSearch, getString, autoremoveDups, preserveFirst.
// Load after duplicateEntriesWindowDisplay.js, before duplicateEntriesWindow.js.

var DuplicateEntriesWindowSearch = (function() {
	"use strict";

	/**
	 * Increments internal pointers to next available card pair.
	 * TB128: Uses address book IDs (abId1, abId2) instead of directories.
	 * Returns true if and only if next pair is available.
	 * @param {object} ctx - Context (window object) with vcards, BOOK_1, BOOK_2, abId1, abId2, position1, position2
	 * @returns {boolean} True if next pair is available, false otherwise
	 */
	function searchPositionsToNext(ctx) {
		// Safety checks
		if (!ctx.vcards || !ctx.vcards[ctx.BOOK_1] || !ctx.vcards[ctx.BOOK_2]) {
			console.warn("searchPositionsToNext: Invalid vcards structure");
			return false;
		}
		
		if (ctx.position1 < 0 || ctx.position1 >= ctx.vcards[ctx.BOOK_1].length) {
			console.warn("searchPositionsToNext: Invalid position1:", ctx.position1);
			return false;
		}
		
		if (!ctx.vcards[ctx.BOOK_1][ctx.position1])
			ctx.position2 = ctx.vcards[ctx.BOOK_2].length;

		ctx.positionSearch++;
		// Calculate max iterations based on address book sizes
		// This prevents infinite loops while allowing legitimate large searches
		var num1 = ctx.vcards[ctx.BOOK_1].length;
		var num2 = ctx.vcards[ctx.BOOK_2].length;
		var maxComparisons = ctx.abId1 == ctx.abId2 
			? (num1 * (num1 - 1) / 2) 
			: (num1 * num2);
		// Use 20x multiplier to account for position advancement (skipping empty slots, etc.)
		var maxIterations = Math.max(100000, maxComparisons * 20);
		var iterations = 0;
		
		do {
			iterations++;
			if (iterations > maxIterations) {
				console.error("searchPositionsToNext: Exceeded max iterations", maxIterations);
				return false;
			}
			
			++(ctx.position2);
			// Same book: never compare a card with itself (position2 must be > position1)
			if (ctx.abId1 == ctx.abId2 && ctx.position2 <= ctx.position1) {
				ctx.position2 = ctx.position1 + 1;
			}
			if (ctx.position2 >= ctx.vcards[ctx.BOOK_2].length) {
				do {
					ctx.position1++;
					if (ctx.updateProgress) ctx.updateProgress();
					if (ctx.position1 + (ctx.abId1 == ctx.abId2 ? 1 : 0) >= ctx.vcards[ctx.BOOK_1].length)
						return false;
				} while (ctx.position1 < ctx.vcards[ctx.BOOK_1].length && !ctx.vcards[ctx.BOOK_1][ctx.position1]);
				ctx.position2 = (ctx.abId1 == ctx.abId2 ? ctx.position1 + 1 : 0);
			}
		} while (ctx.position2 < ctx.vcards[ctx.BOOK_2].length && !ctx.vcards[ctx.BOOK_2][ctx.position2]);
		
		// Final validation
		if (ctx.position2 >= ctx.vcards[ctx.BOOK_2].length || ctx.position1 >= ctx.vcards[ctx.BOOK_1].length) {
			return false;
		}
		
		return true;
	}

	/**
	 * Advances internal pointers to next available card pair (or next in duplicates queue).
	 * Used when deferInteractive option is enabled.
	 * Returns true if and only if next pair is available.
	 * @param {object} ctx - Context (window object) with duplicates array, positionDuplicates
	 * @returns {boolean} True if next duplicate is available, false otherwise
	 */
	function skipPositionsToNext(ctx) {
		// Safety checks
		if (!ctx.vcards || !ctx.vcards[ctx.BOOK_1] || !ctx.vcards[ctx.BOOK_2]) {
			console.warn("skipPositionsToNext: Invalid vcards structure");
			return false;
		}
		
		if (!ctx.deferInteractive || !ctx.nowHandling) {
			if (searchPositionsToNext(ctx))
				return true;
			if (!ctx.deferInteractive)
				return false;
			ctx.nowHandling = true;
		}
		
		if (!ctx.duplicates || !Array.isArray(ctx.duplicates)) {
			console.warn("skipPositionsToNext: Invalid duplicates array");
			return false;
		}
		
		// Calculate max iterations based on duplicates array size
		// Allow up to 10x the number of duplicates to account for position advancement
		var maxIterations = Math.max(10000, (ctx.duplicates ? ctx.duplicates.length : 0) * 10);
		var iterations = 0;
		do {
			iterations++;
			if (iterations > maxIterations) {
				console.error("skipPositionsToNext: Exceeded max iterations in duplicates loop", maxIterations);
				return false;
			}
			
			if (ctx.positionDuplicates++ >= ctx.duplicates.length)
				return false;
			[ctx.position1, ctx.position2] = ctx.duplicates[ctx.positionDuplicates - 1];
		} while ((ctx.position1 < 0 || ctx.position1 >= ctx.vcards[ctx.BOOK_1].length || !ctx.vcards[ctx.BOOK_1][ctx.position1]) ||
		         (ctx.position2 < 0 || ctx.position2 >= ctx.vcards[ctx.BOOK_2].length || !ctx.vcards[ctx.BOOK_2][ctx.position2]));
		
		if (ctx.updateProgress) ctx.updateProgress();
		return true;
	}

	/**
	 * Performs the actual search loop. Called via setTimeout from the main window's searchNextDuplicate.
	 * TB128: Uses plain JavaScript card objects and async card operations.
	 * Runs until a duplicate is found (then shows UI and returns), or 1s has elapsed (then re-schedules itself), or search ends (calls ctx.endSearch()).
	 * Yields control every ~1 second to allow UI updates.
	 * @param {object} ctx - Context (window object) with all search state and callbacks
	 */
	function runIntervalAction(ctx) {
		try {
			var lasttime = new Date();
			var iterations = 0;
			// Calculate max iterations based on actual number of contacts
			// For same book: n*(n-1)/2 comparisons, for different books: n*m comparisons
			// Multiply by 20 to account for position advancement iterations (skipping empty slots, etc.)
			// This ensures we can handle large address books without hitting the limit prematurely
			var num1 = ctx.vcards && ctx.vcards[ctx.BOOK_1] ? ctx.vcards[ctx.BOOK_1].length : 0;
			var num2 = ctx.vcards && ctx.vcards[ctx.BOOK_2] ? ctx.vcards[ctx.BOOK_2].length : 0;
			var maxComparisons = ctx.abId1 == ctx.abId2 
				? (num1 * (num1 - 1) / 2) 
				: (num1 * num2);
			// Set max iterations to 20x the number of comparisons, with a minimum of 100k
			// No upper limit to support very large address books
			var maxIterations = Math.max(100000, maxComparisons * 20);
			
			while (skipPositionsToNext(ctx)) {
				iterations++;
				if (iterations > maxIterations) {
					console.error("runIntervalAction: Exceeded max iterations, breaking. Final positions - position1:", ctx.position1, "position2:", ctx.position2);
					if (ctx.endSearch) ctx.endSearch();
					return;
				}
				
				// Check timeout every 50 iterations to reduce overhead
				if (iterations % 50 === 0) {
					if ((new Date()) - lasttime >= 1000) {
						// Force/enable Thunderbird every 1000 milliseconds to redraw the progress bar etc.
						// See also http://stackoverflow.com/questions/2592335/how-to-report-progress-of-a-javascript-function
						// As a nice side effect, this allows the stop button to take effect while this main loop is active!
						if (typeof DuplicateEntriesWindowSearch !== 'undefined' && DuplicateEntriesWindowSearch.runIntervalAction) {
							setTimeout(function() { DuplicateEntriesWindowSearch.runIntervalAction(ctx); }, 13);
						} else {
							console.error("DuplicateEntriesWindowSearch not available in setTimeout");
							if (ctx.endSearch) ctx.endSearch();
						}
						return;
					}
				}

				// Safety check: ensure we have valid card indices
				if (!ctx.vcards || !ctx.vcards[ctx.BOOK_1] || !ctx.vcards[ctx.BOOK_2] ||
				    ctx.position1 < 0 || ctx.position1 >= ctx.vcards[ctx.BOOK_1].length ||
				    ctx.position2 < 0 || ctx.position2 >= ctx.vcards[ctx.BOOK_2].length ||
				    !ctx.vcards[ctx.BOOK_1][ctx.position1] || !ctx.vcards[ctx.BOOK_2][ctx.position2]) {
					console.warn("runIntervalAction: Invalid card indices:", ctx.position1, ctx.position2);
					continue;
				}

				if (!ctx.getSimplifiedCard) {
					console.error("runIntervalAction: getSimplifiedCard not available");
					if (ctx.endSearch) ctx.endSearch();
					return;
				}
				
				var simplified_card1 = ctx.getSimplifiedCard(ctx.BOOK_1, ctx.position1);
				var simplified_card2 = ctx.getSimplifiedCard(ctx.BOOK_2, ctx.position2);
				
				if (!simplified_card1 || !simplified_card2) {
					console.warn("runIntervalAction: Failed to get simplified cards for positions:", ctx.position1, ctx.position2);
					continue;
				}
				
				// Check AIM screen names (use empty string if undefined)
				var aim1 = simplified_card1['_AimScreenName'] || '';
				var aim2 = simplified_card2['_AimScreenName'] || '';
				if (aim1 != aim2)
					continue;
				
				var M = DuplicateEntriesWindowMatching;
				var namesmatch = M.namesMatch(simplified_card1, simplified_card2);
				var mailsmatch = M.mailsMatch(simplified_card1, simplified_card2);
				var phonesmatch = M.phonesMatch(simplified_card1, simplified_card2);
				var nomailsphonesmatch = M.noMailsPhonesMatch(simplified_card1) &&
				                        M.noMailsPhonesMatch(simplified_card2);
				var nomatch = M.noNamesMatch(simplified_card1) &&
				              M.noNamesMatch(simplified_card2) && nomailsphonesmatch;
				if (namesmatch || mailsmatch || phonesmatch || nomatch) {
					var card1 = ctx.vcards[ctx.BOOK_1][ctx.position1];
					var card2 = ctx.vcards[ctx.BOOK_2][ctx.position2];
					
					if (!card1 || !card2) {
						console.warn("runIntervalAction: Cards are null at positions:", ctx.position1, ctx.position2);
						continue;
					}
					
					if (!DuplicateEntriesWindowComparison || !DuplicateEntriesWindowComparison.compareCards) {
						console.error("runIntervalAction: DuplicateEntriesWindowComparison.compareCards not available");
						if (ctx.endSearch) ctx.endSearch();
						return;
					}
					
					var comparisonResult = DuplicateEntriesWindowComparison.compareCards(card1, card2, ctx);
					if (!comparisonResult || !Array.isArray(comparisonResult) || comparisonResult.length < 2) {
						console.error("runIntervalAction: Invalid comparison result");
						continue;
					}
					
					var comparison = comparisonResult[0];
					var preference = comparisonResult[1];
					if (comparison != -2 && ctx.autoremoveDups &&
				    !(ctx.abId1 != ctx.abId2 && ctx.preserveFirst && preference < 0)) {
					if (ctx.deleteAbCard) {
						if (preference < 0)
							ctx.deleteAbCard(ctx.abId1, ctx.BOOK_1, ctx.position1, true);
						else
							ctx.deleteAbCard(ctx.abId2, ctx.BOOK_2, ctx.position2, true);
						}
					} else {
						if (ctx.deferInteractive && !ctx.nowHandling) {
							if (!ctx.duplicates) ctx.duplicates = [];
							ctx.duplicates.push([ctx.position1, ctx.position2]);
						} else {
							if (DuplicateEntriesWindowUI && DuplicateEntriesWindowUI.showDuplicatePairState) {
								DuplicateEntriesWindowUI.showDuplicatePairState(ctx);
							}
							if (ctx.statustext) {
								ctx.statustext.className = 'with-progress';
								if (ctx.getString) {
									ctx.statustext.textContent = ctx.getString(nomatch ? 'noMatch' : 'matchFound');
								}
							}
							if (ctx.displayCardData) {
								ctx.displayCardData(card1, card2, comparison, preference,
									namesmatch, mailsmatch, phonesmatch);
							}
							return;
						}
					}
				}
			}
			if (ctx.endSearch) ctx.endSearch();
		} catch (error) {
			console.error("Error in runIntervalAction:", error);
			if (ctx.statustext) {
				ctx.statustext.textContent = "Error: " + (error.message || error);
			}
			if (ctx.endSearch) ctx.endSearch();
		}
	}

	return {
		searchPositionsToNext: searchPositionsToNext,
		skipPositionsToNext: skipPositionsToNext,
		runIntervalAction: runIntervalAction
	};
})();
