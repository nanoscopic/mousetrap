// Copyright (c) 2020 David Helkowski
// License Apache 2.0 - http://www.apache.org/licenses/LICENSE-2.0

export default class Mousetrap {
    /** mapping of special keycodes to their corresponding keys
     * everything in this dictionary cannot use keypress events
     * so it has to be here to map to the correct keycodes for
     * keyup/keydown events */
    static _MAP = {
        8:'backspace', 9:'tab', 13:'enter', 16:'shift', 17:'ctrl', 18:'alt', 20:'capslock',
        27:'esc', 32:'space', 33:'pageup', 34:'pagedown', 35:'end', 36:'home', 37:'left',
        38:'up', 39:'right', 40:'down', 45:'ins', 46:'del', 91:'meta', 93:'meta', 224:'meta'
    };
    
    /** mapping for special characters so they can support
     * this dictionary is only used incase you want to bind a
     * keyup or keydown event to one of these keys */
    static _KEYCODE_MAP = {
        106:'*', 107:'+', 109:'-', 110:'.', 111:'/', 186:';', 187:'=', 188:',', 189:'-',
        190:'.', 191:'/', 192:'`', 219:'[', 220:'\\', 221:']', 222:'\''
    };
    
    /** this is a mapping of keys that require shift on a US keypad back to the non shift equivelents
     * this is so you can use keyup events with these keys
     * this will only work reliably on US keyboards */
    static _SHIFT_MAP = {
        '~':'`', '!':'1', '@':'2', '#':'3', '$':'4', '%':'5', '^':'6', '&':'7', '*':'8',
        '(':'9', ')':'0', '_':'-', '+':'=', ':':';', '\"':'\'', '<':',', '>':'.', '?':'/', '|':'\\'
    };
    
    /** this is a list of special strings you can use to map
     * to modifier keys when you specify your keyboard shortcuts */
    static _SPECIAL_ALIASES = {
        'option': 'alt',
        'command': 'meta',
        'return': 'enter',
        'escape': 'esc',
        'plus': '+',
        'mod': /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'meta' : 'ctrl'
    };
    
    /** variable to store the flipped version of _MAP from above
     * needed to check if we should use keypress or not when no action
     * is specified */
    static _REVERSE_MAP = {};
    
    static staticConstructor() {
        /// loop through the f keys, f1 to f19 and add them to the map programatically
        for (var i = 1; i < 20; ++i) {
            this._MAP[111 + i] = 'f' + i;
        }
        
        // loop through to map numbers on the numeric keypad
        for (i = 0; i <= 9; ++i) {
            // This needs to use a string cause otherwise since 0 is falsey mousetrap will never fire for numpad 0
            // pressed as part of a keydown event.
            // @see https://github.com/ccampbell/mousetrap/pull/258
            this._MAP[i + 96] = i.toString();
        }
    }
    
    constructor( targetElement ) {
        this.targetElement = targetElement || document;
    
        /** element to attach key events to
         * @type {Element} */
        this.target = targetElement;
        
        // start
        Mousetrap.#addEvent( this.targetElement, 'keypress', this.#handleKeyEvent.bind(this) );
        Mousetrap.#addEvent( this.targetElement, 'keydown', this.#handleKeyEvent.bind(this) );
        Mousetrap.#addEvent( this.targetElement, 'keyup', this.#handleKeyEvent.bind(this) );
    }
    
    mouseTrapEnabled = true;

    pause() {
        this.mouseTrapEnabled = false;
    }

    unpause() {
        this.mouseTrapEnabled = true;
    }
    
    stopCallback(event, element) {
        if (!this.mouseTrapEnabled) return true;
  
        // if the element has the class "mousetrap" then no need to stop
        if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
            return false;
        }
  
        return (element.contentEditable && element.contentEditable == 'true');
    };
    
    /** binds an event to mousetrap
     * can be a single key, a combination of keys separated with +, an array of keys, or a sequence of keys separated by spaces
     * be sure to list the modifier keys first to make sure that the correct key ends up getting bound (the last key in the pattern)
     * @param {string|Array} keys
     * @param {Function} callback
     * @param {string=} action - 'keypress', 'keydown', or 'keyup' */
    bind(keys, callback, action) {
        keys = keys instanceof Array ? keys : [keys];
        this._bindMultiple.call(this, keys, callback, action);
        return this;
    };
    
    /** unbinds an event to mousetrap
     * the unbinding sets the callback function of the specified key combo
     * to an empty function and deletes the corresponding key in the
     * _directMap dict.
     *
     * TODO: actually remove this from the _callbacks dictionary instead
     * of binding an empty function
     *
     * the keycombo+action has to be exactly the same as
     * it was defined in the bind method
     * @param {string|Array} keys
     * @param {string} action */
    unbind(keys, action) {
        this.bind( keys, function() {}, action );
        return this;
    };
    
    /** triggers an event that has already been bound
     * @param {string} keys
     * @param {string=} action */
    trigger(keys, action) {
        if (this._directMap[keys + ':' + action]) {
            this._directMap[keys + ':' + action]({}, keys);
        }
        return this;
    };
    
    /** resets the library back to its initial state.  this is useful
     * if you want to clear out the current keyboard shortcuts and bind
     * new ones - for example if you switch to another page */
    reset() {
        this._callbacks = {};
        this._directMap = {};
        return this;
    };
    
    /** allow custom key mappings */
    static addKeycodes(object) {
        for (var key in object) {
            if (object.hasOwnProperty(key)) this._MAP[key] = object[key];
        }
        this._REVERSE_MAP = null;
    };
    
    /** a list of all the callbacks setup via Mousetrap.bind() */
    _callbacks = {};
    
    /** direct map of string combinations to callbacks used for trigger() */
    _directMap = {};
    
    /** keeps track of what level each sequence is at since multiple sequences can start out with the same sequence */
    _sequenceLevels = {};
    
    /** variable to store the setTimeout call
     * @type {null|number} */
    _resetTimer;
    
    /** temporary state where we will ignore the next keyup
     * @type {boolean|string} */
    _ignoreNextKeyup = false;
    
    /** temporary state where we will ignore the next keypress */
    _ignoreNextKeypress = false;
    
    /** are we currently inside of a sequence?
     * type of action ("keyup" or "keydown" or "keypress") or false
     * @type {boolean|string} */
    _nextExpectedAction = false;
    
    /** resets all sequence counters except for the ones passed in
     * @param {Object} doNotReset */
    #resetSequences(doNotReset) {
        doNotReset = doNotReset || {};
        
        var activeSequences = false, key;
        
        for (key in this._sequenceLevels) {
            if (doNotReset[key]) {
                activeSequences = true;
                continue;
            }
            this._sequenceLevels[key] = 0;
        }
        
        if (!activeSequences) this._nextExpectedAction = false;
    }
    
    /** finds all callbacks that match based on the keycode, modifiers, and action
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event|Object} e
     * @param {string=} sequenceName - name of the sequence we are looking for
     * @param {string=} combination
     * @param {number=} level
     * @returns {Array} */
    #getMatches(character, modifiers, e, sequenceName, combination, level) {
        var i;
        var callback;
        var matches = [];
        var action = e.type;
        
        // if there are no events related to this keycode
        if (!this._callbacks[character]) return [];
        
        // if a modifier key is coming up on its own we should allow it
        if (action == 'keyup' && Mousetrap.#isModifier(character)) modifiers = [character];
        
        // loop through all callbacks for the key that was pressed and see if any of them match
        for (i = 0; i < this._callbacks[character].length; ++i) {
            callback = this._callbacks[character][i];
            
            // if a sequence name is not specified, but this is a sequence at
            // the wrong level then move onto the next match
            if (!sequenceName && callback.seq && this._sequenceLevels[callback.seq] != callback.level) {
                continue;
            }
            
            // if the action we are looking for doesn't match the action we got then we should keep going
            if (action != callback.action) continue;
            
            // if this is a keypress event and the meta key and control key are not pressed that means that
            // we need to only look at the character, otherwise check the modifiers as well
            //
            // chrome will not fire a keypress if meta or control is down
            // safari will fire a keypress if meta or meta+shift is down
            // firefox will fire a keypress if meta or control is down
            if ((action == 'keypress' && !e.metaKey && !e.ctrlKey) || Mousetrap.#modifiersMatch(modifiers, callback.modifiers)) {
                // when you bind a combination or sequence a second time it
                // should overwrite the first one.  if a sequenceName or
                // combination is specified in this call it does just that
                // @todo make deleting its own method?
                var deleteCombo = !sequenceName && callback.combo == combination;
                var deleteSequence = sequenceName && callback.seq == sequenceName && callback.level == level;
                if (deleteCombo || deleteSequence) {
                    this._callbacks[character].splice(i, 1);
                }
                
                matches.push(callback);
            }
        }
        
        return matches;
    }
    
    /** actually calls the callback function
     *
     * if your callback function returns false this will use the jquery
     * convention - prevent default and stop propogation on the event
     * @param {Function} callback
     * @param {Event} e */
    _fireCallback(callback, e, combo, sequence) {
        // if this event should not happen stop here
        if (this.stopCallback(e, e.target || e.srcElement, combo, sequence)) {
            return;
        }
        
        if (callback(e, combo) === false) {
            this.#preventDefault(e);
            this.#stopPropagation(e);
        }
    }
    
    /** handles a character key event
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event} e */
    handleKey(character, modifiers, e) {
        var callbacks = this.#getMatches(character, modifiers, e);
        var i;
        var doNotReset = {};
        var maxLevel = 0;
        var processedSequenceCallback = false;
        
        // Calculate the maxLevel for sequences so we can only execute the longest callback sequence
        for (i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].seq) maxLevel = Math.max(maxLevel, callbacks[i].level);
        }
        
        // loop through matching callbacks for this key event
        for (i = 0; i < callbacks.length; ++i) {
            // fire for all sequence callbacks
            // this is because if for example you have multiple sequences
            // bound such as "g i" and "g t" they both need to fire the
            // callback for matching g cause otherwise you can only ever
            // match the first one
            if (callbacks[i].seq) {
                // only fire callbacks for the maxLevel to prevent subsequences from also firing
                //
                // for example 'a option b' should not cause 'option b' to fire
                // even though 'option b' is part of the other sequence
                //
                // any sequences that do not match here will be discarded below by the _resetSequences call
                if (callbacks[i].level != maxLevel) continue;
                
                processedSequenceCallback = true;
                
                // keep a list of which sequences were matches for later
                doNotReset[callbacks[i].seq] = 1;
                this._fireCallback(callbacks[i].callback, e, callbacks[i].combo, callbacks[i].seq);
                continue;
            }
            
            // if there were no sequence matches but we are still here
            // that means this is a regular match so we should fire that
            if (!processedSequenceCallback) this._fireCallback(callbacks[i].callback, e, callbacks[i].combo);
        }
        
        // if the key you pressed matches the type of sequence without
        // being a modifier (ie "keyup" or "keypress") then we should
        // reset all sequences that were not matched by this event
        //
        // this is so, for example, if you have the sequence "h a t" and you
        // type "h e a r t" it does not match.  in this case the "e" will
        // cause the sequence to reset
        //
        // modifier keys are ignored because you can have a sequence
        // that contains modifiers such as "enter ctrl+space" and in most
        // cases the modifier key will be pressed before the next key
        //
        // also if you have a sequence such as "ctrl+b a" then pressing the
        // "b" key will trigger a "keypress" and a "keydown"
        //
        // the "keydown" is expected when there is a modifier, but the
        // "keypress" ends up matching the _nextExpectedAction since it occurs
        // after and that causes the sequence to reset
        //
        // we ignore keypresses in a sequence that directly follow a keydown
        // for the same character
        var ignoreThisKeypress = e.type == 'keypress' && this._ignoreNextKeypress;
        if (e.type == this._nextExpectedAction && !Mousetrap.#isModifier(character) && !ignoreThisKeypress) {
            this.#resetSequences(doNotReset);
        }
        
        this._ignoreNextKeypress = processedSequenceCallback && e.type == 'keydown';
    };
    
    /** handles a keydown event
     * @param {Event} e */
    #handleKeyEvent( e ) {
        // normalize e.which for key events
        // @see http://stackoverflow.com/questions/4285627/javascript-keycode-vs-charcode-utter-confusion
        if (typeof e.which !== 'number') e.which = e.keyCode;
        
        var character = Mousetrap.#characterFromEvent(e);
        
        // no character found then stop
        if (!character) return;
        
        // need to use === for the character check because the character can be 0
        if (e.type == 'keyup' && this._ignoreNextKeyup === character) {
            this._ignoreNextKeyup = false;
            return;
        }
        
        this.handleKey(character, Mousetrap.#eventModifiers(e), e);
    }
    
    /** called to set a 1 second timeout on the specified sequence
     *
     * this is so after each key press in the sequence you have 1 second
     * to press the next key before you have to start over */
    #resetSequenceTimer() {
        clearTimeout(this._resetTimer);
        this._resetTimer = setTimeout(this.#resetSequences, 1000);
    }
    
    /** binds a key sequence to an event
     * @param {string} combo - combo specified in bind call
     * @param {Array} keys
     * @param {Function} callback
     * @param {string=} action */
    #bindSequence(combo, keys, callback, action) {
        // start off by adding a sequence level record for this combination
        // and setting the level to 0
        this._sequenceLevels[combo] = 0;
        
        var self = this;
        
        /** callback to increase the sequence level for this sequence and reset
         * all other sequences that were active
         * @param {string} nextAction
         * @returns {Function} */
        function _increaseSequence(nextAction) {
            return function() {
                self._nextExpectedAction = nextAction;
                ++self._sequenceLevels[combo];
                self._resetSequenceTimer();
            };
        }
        
        /** wraps the specified callback inside of another function in order
         * to reset all sequence counters as soon as this sequence is done
         *
         * @param {Event} e */
        function _callbackAndReset(e) {
            self._fireCallback(callback, e, combo);
            
            // we should ignore the next key up if the action is key down
            // or keypress.  this is so if you finish a sequence and
            // release the key the final key will not trigger a keyup
            if (action !== 'keyup') self._ignoreNextKeyup = Mousetrap.#characterFromEvent(e);
            
            // weird race condition if a sequence ends with the key
            // another sequence begins with
            setTimeout( self._resetSequences, 10 );
        }
        
        // loop through keys one at a time and bind the appropriate callback
        // function.  for any key leading up to the final one it should
        // increase the sequence. after the final, it should reset all sequences
        //
        // if an action is specified in the original bind call then that will
        // be used throughout.  otherwise we will pass the action that the
        // next key in the sequence should match.  this allows a sequence
        // to mix and match keypress and keydown events depending on which
        // ones are better suited to the key provided
        for (var i = 0; i < keys.length; ++i) {
            var isFinal = i + 1 === keys.length;
            var wrappedCallback = isFinal ? _callbackAndReset : _increaseSequence(action || Mousetrap.#getKeyInfo(keys[i + 1]).action);
            this._bindSingle(keys[i], wrappedCallback, action, combo, i);
        }
    }
    
    /** binds a single keyboard combination
     * @param {string} combination
     * @param {Function} callback
     * @param {string=} action
     * @param {string=} sequenceName - name of sequence if part of sequence
     * @param {number=} level - what part of the sequence the command is */
    _bindSingle(combination, callback, action, sequenceName, level) {
        // store a direct mapped reference for use with Mousetrap.trigger
        this._directMap[combination + ':' + action] = callback;
        
        // make sure multiple spaces in a row become a single space
        combination = combination.replace(/\s+/g, ' ');
        
        var sequence = combination.split(' ');
        
        // if this pattern is a sequence of keys then run through this method
        // to reprocess each pattern one key at a time
        if (sequence.length > 1) {
            this.#bindSequence(combination, sequence, callback, action);
            return;
        }
        
        var info = Mousetrap.#getKeyInfo(combination, action);

        // make sure to initialize array if this is the first time
        // a callback is added for this key
        this._callbacks[info.key] = this._callbacks[info.key] || [];
        
        // remove an existing match if there is one
        this.#getMatches(info.key, info.modifiers, {type: info.action}, sequenceName, combination, level);
        
        // add this call back to the array
        // if it is a sequence put it at the beginning
        // if not put it at the end
        //
        // this is important because the way these are processed expects
        // the sequence ones to come first
        this._callbacks[info.key][sequenceName ? 'unshift' : 'push']({
            callback: callback,
            modifiers: info.modifiers,
            action: info.action,
            seq: sequenceName,
            level: level,
            combo: combination
        });
    }
    
    /** binds multiple combinations to the same callback
     * @param {Array} combinations
     * @param {Function} callback
     * @param {string|undefined} action */
    _bindMultiple(combinations, callback, action) {
        for (var i = 0; i < combinations.length; ++i) {
            this._bindSingle(combinations[i], callback, action);
        }
    };
    
    /** cross browser add event method
     * @param {Element|HTMLDocument} object
     * @param {string} type
     * @param {Function} callback */
    static #addEvent(object, type, callback) {
        if (object.addEventListener) {
            object.addEventListener(type, callback, false);
            return;
        }

        object.attachEvent('on' + type, callback);
    }
    
    /** takes the event and returns the key character
     * @param {Event} e
     * @return {string} */
    static #characterFromEvent(e) {
        // for keypress events we should return the character as is
        if (e.type == 'keypress') {
            var character = String.fromCharCode(e.which);

            // no shift -> assume lowercase
            // caps lock ignored
            
            // binding to capital A still possible
            // caps lock won't trigger capital A
            
            if (!e.shiftKey) return character.toLowerCase();

            return character;
        }
        
        // for non keypress events the special maps are needed
        if (this._MAP[e.which]) return this._MAP[e.which];
        if (this._KEYCODE_MAP[e.which]) return this._KEYCODE_MAP[e.which];
        
        // keyup/keydown events always pass keys as uppercase; convert to lowercase
        return String.fromCharCode(e.which).toLowerCase();
    }
    
    static #modifiersMatch(modifiers1, modifiers2) {
        return modifiers1.sort().join(',') === modifiers2.sort().join(',');
    }
    
    /** takes a key event and figures out what the modifiers are
     * @param {Event} e
     * @returns {Array} */
    static #eventModifiers(e) {
        var modifiers = [];
        if( e.shiftKey ) modifiers.push('shift');
        if( e.altKey   ) modifiers.push('alt');
        if( e.ctrlKey  ) modifiers.push('ctrl');
        if( e.metaKey  ) modifiers.push('meta');
        return modifiers;
    }
    
    static #preventDefault(e) {
        if (e.preventDefault) {
            e.preventDefault();
            return;
        }
        e.returnValue = false;
    }
    
    static #stopPropagation(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
            return;
        }
        e.cancelBubble = true;
    }
    
    /** @param {string} key
     * @returns {boolean} */
    static #isModifier(key) {
        return key == 'shift' || key == 'ctrl' || key == 'alt' || key == 'meta';
    }
    
    /** reverses the map lookup so that we can look for specific keys to see what can and can't use keypress
     * @return {Object} */
    static #getReverseMap() {
        if (!this._REVERSE_MAP) {
            this._REVERSE_MAP = {};
            for (var key in this._MAP) {
                // pull out the numeric keypad from here cause keypress should be able to detect the keys from the character
                if (key > 95 && key < 112) continue;
                
                if (this._MAP.hasOwnProperty(key)) this._REVERSE_MAP[this._MAP[key]] = key;
            }
        }
        return this._REVERSE_MAP;
    }
    
    /** picks the best action based on the key combination
     * @param {string} key - character for key
     * @param {Array} modifiers
     * @param {string=} action passed in */
    static #pickBestAction(key, modifiers, action) {
        // if no action was picked in we should try to pick the one that we think would work best for this key
        if (!action) action = this.#getReverseMap()[key] ? 'keydown' : 'keypress';
        
        // modifier keys don't work as expected with keypress, switch to keydown
        if (action == 'keypress' && modifiers.length) action = 'keydown';
        
        return action;
    }
    
    /** Converts from a string key combination to an array
     * @param  {string} combination like "command+shift+l"
     * @return {Array} */
    static #keysFromString(combination) {
        if (combination === '+') return ['+'];
        
        combination = combination.replace(/\+{2}/g, '+plus');
        return combination.split('+');
    }
    
    /** Gets info for a specific key combination
     * @param  {string} combination key combination ("command+s" or "a" or "*")
     * @param  {string=} action
     * @returns {Object} */
    static #getKeyInfo(combination, action) {
        var keys, key, i, modifiers = [];
        
        // Take the keys from this pattern and figure out what the actual pattern is all about
        keys = this.#keysFromString(combination);
        
        for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            
            // normalize key names
            if (this._SPECIAL_ALIASES[key]) key = this._SPECIAL_ALIASES[key];
            
            // if this is not a keypress event then we should be smart about using shift keys
            // this will only work for US keyboards however
            if (action && action != 'keypress' && this._SHIFT_MAP[key]) {
                key = this._SHIFT_MAP[key];
                modifiers.push('shift');
            }
            
            // if this key is a modifier then add it to the list of modifiers
            if (Mousetrap.#isModifier(key)) modifiers.push(key);
        }
        
        // depending on what the key combination is we will try to pick the best event for it
        action = this.#pickBestAction(key, modifiers, action);
        
        return {
            key: key,
            modifiers: modifiers,
            action: action
        };
    }
    
    static #belongsTo(element, ancestor) {
        if (element === null || element === document) return false;
        if (element === ancestor) return true;
       
        return this.#belongsTo(element.parentNode, ancestor);
    }
}

Mousetrap.staticConstructor();