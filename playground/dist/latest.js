"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let globalVariableId = 0;
const allReactiveVariables = new Map();
/**
 * @description A reactive wrapper for variables.
 * Only a ReactiveVariable will cause changes on a ElementWrapper.
 */
class ReactiveVariable {
    constructor(value) {
        // All actions to perform when the variable changes
        // [ElementWrapper, action-callback, action-uid, action-parameters]
        this.actions = [];
        this.id = globalVariableId++;
        this._value = value;
        this.addToGlobalStorage();
    }
    addToGlobalStorage() {
        allReactiveVariables.set(this.id, this);
    }
    set value(val) {
        this._value = val;
        this.triggerChangeChain();
    }
    get value() {
        return this._value;
    }
    addAction(ew, action, id, actionParams) {
        this.actions.push([ew, action, id, actionParams]);
    }
    performAllActionsFromLinkedElementWrappers() {
        this.actions.forEach(action => { if (action[0].isMounted)
            action[1](...action[3]); });
    }
    triggerChangeChain() {
        this.performAllActionsFromLinkedElementWrappers();
    }
}
/**
 * @description This can be used to wrap any element (and maybe text-nodes).
 * On its own it is not really that special, atm it provides a couple of functions to mutate
 * the element it wraps.
 *
 * The true power of this wrapper is when a ReactiveVariable is used with a mutate function.
 * When this is done, the variable will become aware of the element, and perform the action that
 * it was first used for every time it changes.
 */
class ElementWrapper {
    // private liveChildren?: HTMLCollection;
    constructor(tag, parent) {
        this.valueBindings = new Map();
        this.mounted = false;
        this.activeEventListeners = new Map();
        this.$el = document.createElement(tag);
        this.parent = parent;
    }
    /**
     * @description We do not use any "virtual dom" to perform changes in the dom, so all we could need rom the parent is its HTMLElement
     */
    get $parentRawEl() {
        return this.parent instanceof ElementWrapper ? this.parent.$el : this.parent;
    }
    get trueMounted() {
        return this.$el.isConnected;
    }
    get isMounted() {
        return this.mounted;
    }
    /**
     * @description Adding some lifecycle-methods. These can be async.
     */
    onBeforeMount(cb) { this.beforeMountCb = cb; }
    onMount(cb) { this.mountedCb = () => cb(this.$el); }
    onBeforeUnmount(cb) { this.beforeUnmountCb = () => cb(this.$el); }
    onUnmount(cb) { this.unmountedCb = cb; }
    mount() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.mounted)
                return console.warn('HTMLElement already mounted');
            if (this.beforeMountCb)
                yield this.beforeMountCb();
            this.$parentRawEl.appendChild(this.$el);
            // this.liveChildren = this.$el.children;
            this.mounted = true;
            if (this.mountedCb)
                yield this.mountedCb();
        });
    }
    unmount() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.mounted)
                return console.warn('HTMLElement already unmounted');
            if (this.beforeUnmountCb)
                yield this.beforeUnmountCb();
            this.$parentRawEl.removeChild(this.$el);
            this.mounted = false;
            if (this.unmountedCb)
                yield this.unmountedCb();
            this.clearUp();
        });
    }
    clearUp() {
        // Removing any active event-listeners
        this.activeEventListeners.forEach((options, event) => this.$el.removeEventListener(event, options[0], ...options[1]));
    }
    /**
     * @description Binding this element to a reactive variable.
     */
    addActionAndElementToReactiveVariable(bindingId, rv, action, actionParams) {
        this.valueBindings.set(bindingId, rv);
        rv.addAction(this, action.bind(this), bindingId, actionParams);
    }
    /**
     * @description Returning the "actual" value wanted and binding this element if the value is reactive
     */
    extractRawValueAndBindIfReactiveVariable(uid, val, action, actionParams) {
        if (val instanceof ReactiveVariable) {
            const bindingId = val.id + uid;
            if (!this.valueBindings.has(bindingId))
                this.addActionAndElementToReactiveVariable(bindingId, val, action, actionParams);
            return val.value;
        }
        else
            return val;
    }
    /**
     * @description Event-listeners (active ones are stored so they can be removed on unmount)
     */
    addEventListener(event, cb, ...rest) {
        this.$el.addEventListener(event, cb, ...rest);
        this.activeEventListeners.set(event, [cb, rest]);
    }
    removeEventListener(event, cb, ...rest) {
        this.$el.removeEventListener(event, cb, ...rest);
    }
    /**
     * @description These are all the mutations that can be performed in a component.
     * If the val is a ReactiveVariable then the mutation will be fired every time the ReactiveVariable is changed.
     */
    /**
     * @description This function should be used for all types of attributes
     */
    setAttribute(attr, val) {
        const uid = attr + 'attr';
        const attribute = this.extractRawValueAndBindIfReactiveVariable(uid, val, this.setAttribute, [attr, val]);
        this.$el.setAttribute(attr, attribute);
    }
    /**
     * @description danger danger ;)
     */
    setInnerHTML(text) {
        const uid = 'ihtml';
        const innerHTML = this.extractRawValueAndBindIfReactiveVariable(uid, text, this.setInnerHTML, [text]);
        this.$el.innerHTML = innerHTML;
    }
}
/**
 * @description A very simple class for "initializing" an app.
 */
class App {
    constructor(selector) {
        const foundEl = document.querySelector(selector);
        if (!foundEl)
            throw Error('Root element not found');
        this.$root = foundEl;
    }
    createElement(tag, parent = this.$root) {
        const el = new ElementWrapper(tag, parent);
        return el;
    }
}
