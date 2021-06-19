"use strict";
/**
 * Hi!
 * This is a very-very-very early proof-of-concept for an approach for a client-framework-engine that
 * does not use any virtual dom or dom-bindings (via e.g. classes or attributes) to perform changes.
 *
 * I don't know if this approach is used in any existing library, i came up with this myself.
 * I have taken some inspiration from Vue's approach for having observers on variables, however,
 * i also like Svelte's approach on being a compiler instead of a runtime framework. That's the main
 * reason why want to make this a sort of "framework-engine". I am not sure if that is the right term,
 * but the thing i mean when saying this is that these classes are not really ment to be used by programmers
 * themselves (even though they can) - but by a parser/compiler.
 *
 *
 * Important note: I am not saying that this is anywhere near the elegancy and insanity of frameworks like Svelte, Vue or React. This is a hobby project, and i am doing this to have fun.
 *
 * **TODO**
 * - Make children components be aware of when they are unmounted if they didn't perform the unmount themselves (e.g: changing the innerHTML in any parent component)
 * - Support for Text (nodes) [DONE, i think]
 * - Support for SVG
 * - Make the ReactiveVariable much more reactive (currently you have to re-declare it for it to spot the change). Support for just changing a property in an object, or maybe just using "push" on an array in an ReactiveVariable could be nice
 * - General performance enhancements (remove e.g: remove use of forEach)
 * - A shit ton more i haven't thought of
 *
 * **DONE**
 * - Make wrapper for Elements
 * - Make ReactiveVariable which triggers reactivity
 * - Make ReactiveVariable very dynamic and be dependent on other ReactiveVariables
 * - Added a wrapper for returnValues when assigning something dynamic to a ReactiveVariable (makes it so that a reactive variable can be a function + easier to prevent bullshit)
 * - Added some methods for dom-manipulations
 *      -- Setting any attribute
 *      -- Conditional rendering
 *      -- Appending text nodes and updating them
 *      -- Setting innerHTML (not finished)
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Couple of global things
let globalVariableId = 0;
let globalTextNodeId = 0;
const allReactiveVariables = new Map(); // Not used, but maybe useful
const allGlobalTextNodes = new Map();
function isPrimitive(val) {
    return val !== Object(val);
}
class returnValueFunction {
    constructor(valueFunction) {
        this.valueFunction = valueFunction;
    }
    getValue() {
        return this.valueFunction();
    }
}
/**
 * @description A reactive wrapper for variables.
 * Only a ReactiveVariable will cause changes on a ElementWrapper.
 */
class ReactiveVariable {
    constructor(value, dependencies) {
        this.actions = [];
        this.id = globalVariableId++;
        this.setValue(value);
        if (dependencies)
            this.reactToDependencies(dependencies);
        this.addToGlobalStorage();
    }
    addToGlobalStorage() {
        allReactiveVariables.set(this.id, this);
    }
    reactToDependencies(dependencies) {
        dependencies.forEach(rv => rv.addAction(null, this.setValue.bind(this), `${this.id}-1`, [this._value], true));
        dependencies.forEach(rv => rv.addAction(null, this.performAllActionsFromLinkedElementWrappers.bind(this), `${this.id}-2`, [], true));
    }
    setValue(val) {
        this._value = val;
        this.triggerChangeChain();
    }
    redeclareValue(value, dependencies) {
        this.setValue(value);
        if (dependencies)
            this.reactToDependencies(dependencies);
    }
    set value(val) {
        this.setValue(val);
    }
    get value() {
        const rawValue = this._value instanceof returnValueFunction ? this._value.getValue() : this._value instanceof ReactiveVariable ? this._value.value : this._value;
        return rawValue;
    }
    addAction(ew, action, bindingId, actionParams, transparentAction = false) {
        this.actions.push({ ew, action, bindingId, actionParams, transparentAction });
    }
    removeAction(bindingId) {
        this.actions = this.actions.filter(a => a.bindingId !== bindingId);
    }
    performAllActionsFromLinkedElementWrappers() {
        this.actions.forEach(action => {
            var _a;
            if (action.transparentAction || (!action.transparentAction && ((_a = action.ew) === null || _a === void 0 ? void 0 : _a.isMounted)))
                action.action(...action.actionParams);
        });
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
        this.reactiveVariableBindings = new Map();
        this.mounted = false;
        this.activeEventListeners = new Map();
        this.$el = document.createElement(tag);
        this.parent = parent;
    }
    get $parentEl() {
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
            this.addToDOM();
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
            this.removeFromDOM();
            this.mounted = false;
            if (this.unmountedCb)
                yield this.unmountedCb();
            this.cleanUpGarbage();
        });
    }
    addToDOM() {
        var _a;
        (_a = this.$parentEl) === null || _a === void 0 ? void 0 : _a.appendChild(this.$el);
    }
    removeFromDOM() {
        var _a;
        (_a = this.$parentEl) === null || _a === void 0 ? void 0 : _a.removeChild(this.$el);
    }
    cleanUpGarbage() {
        // Removing any active event-listeners
        this.activeEventListeners.forEach((options, event) => this.$el.removeEventListener(event, options[0], ...options[1]));
    }
    /**
     * @description Binding a ReactiveVariable to an action from this ElementWrapper
     */
    bindReactiveVariable(bindingId, rv, action, actionParams, transparentAction) {
        if (this.reactiveVariableBindings.has(bindingId))
            return console.warn('Tried to bind ReactiveVariable with and existing binding-id');
        this.reactiveVariableBindings.set(bindingId, rv);
        rv.addAction(this, action.bind(this), bindingId, actionParams, transparentAction);
    }
    /**
     *
     * @param actionUid The unique-id for an action
     * @param action The action function
     * @param params The params that should be passed into the action-function
     * @param bindingInfo Information about (existing) binding
     * @param transparentAction Optional parameter - If action is transparent or not
     * @description Here we bind an action and all of the ReactiveVariables that it depends on.
     */
    bindReactiveVariablesToAction(actionUid, action, params, bindingInfo, transparentAction) {
        var _a;
        // Little shortcut if we have already binded the action and its ReactiveVariables
        const alreadyBindedCondition = (_a = bindingInfo[1]) === null || _a === void 0 ? void 0 : _a.every((bId) => this.reactiveVariableBindings.has(bId));
        if (alreadyBindedCondition)
            return;
        // Will only be fired on first setup
        const reactiveVariables = bindingInfo[0];
        const createBindingId = (rv) => rv.id + actionUid;
        const allBindingIds = reactiveVariables.map(rv => createBindingId(rv));
        reactiveVariables.forEach((rv) => this.bindReactiveVariable(createBindingId(rv), rv, action, [...params, reactiveVariables, allBindingIds], transparentAction));
    }
    /**
     * @param conditionAction The conditionallyRender-function
     * @param params The params passed into the conditionallyRender-function
     * @description Here we bind the conditionallyRender function and all of the ReactiveVariables that it depends on.
     */
    bindRenderConditionIfNotAlready(conditionAction, params) {
        var _a;
        // Little shortcut if we have already binded the render-condition and its variables
        const alreadyBindedCondition = (_a = params[2]) === null || _a === void 0 ? void 0 : _a.every(bId => this.reactiveVariableBindings.has(bId));
        if (alreadyBindedCondition)
            return;
        // Will only be fired on first setup
        const reactiveVariables = params[1];
        const createBindingId = (rv) => rv.id + params[0].toString();
        const allBindingIds = reactiveVariables.map(rv => createBindingId(rv));
        const updatedParams = params.slice(0, 2).concat([allBindingIds]); // allBindings from the parameter is undefined on setup (because it is created here)
        reactiveVariables.forEach((rv) => this.bindReactiveVariable(createBindingId(rv), rv, conditionAction, updatedParams, true));
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
    // @description These are all the mutations that can be performed in a component.
    // If the val is a ReactiveVariable then the mutation will be fired every time the ReactiveVariable is changed.
    */
    /**
     * @param rawCondition The condition which determines if element shouyld be rendered or not
     * @param rv ReactiveVaribales that will trigger run the conditionallyRender function on value-change
     * @param bindingIds Optional param - is used to ignore some steps if the ReactiveVariables are already binded
     */
    conditionallyRender(rawCondition, rv, bindingIds) {
        this.bindRenderConditionIfNotAlready(this.conditionallyRender, [rawCondition, rv, bindingIds]);
        if (rawCondition() && !this.mounted)
            this.mount();
        else if (!rawCondition() && this.mounted)
            this.unmount();
    }
    /**
     * @description This function should be used for all types of attributes
     */
    setAttribute(attr, val, rv = [], bindingIds) {
        const actionUid = attr + 'attr';
        this.bindReactiveVariablesToAction(actionUid, this.updateAttribute, [attr, val], [rv, bindingIds]);
        this.updateAttribute(attr, val);
    }
    updateAttribute(attr, val) {
        const realValue = val instanceof returnValueFunction ? val.getValue() : val instanceof ReactiveVariable ? val.value : val;
        this.$el.setAttribute(attr, realValue);
    }
    /**
     * @description Appends and update single textNodes
     */
    appendText(text, id = -1, rv = [], bindingIds) {
        const realId = id < 0 ? globalTextNodeId++ : id;
        const actionUid = 'itext' + realId;
        const textNode = document.createTextNode('');
        this.bindReactiveVariablesToAction(actionUid, this.updateText, [text, textNode, false], [rv, bindingIds]);
        this.updateText(text, textNode, true);
    }
    updateText(text, textNode, initialize) {
        const realText = text instanceof returnValueFunction ? text.getValue() : text instanceof ReactiveVariable ? text.value : text;
        textNode.nodeValue = realText;
        if (initialize)
            this.$el.appendChild(textNode);
    }
    /**
     * @description danger danger ;)
     */
    setInnerHTML(html, rv = [], bindingIds) {
        const actionUid = 'ihtml';
        this.bindReactiveVariablesToAction(actionUid, this.updateInnerHTML, [html], [rv, bindingIds]);
        this.updateInnerHTML(html);
    }
    updateInnerHTML(html) {
        const realHtml = html instanceof returnValueFunction ? html.getValue() : html instanceof ReactiveVariable ? html.value : html;
        this.$el.innerHTML = realHtml;
    }
}
/**
 * @description A very simple class for "initializing" an app.
 */
class App {
    constructor(selector) {
        this.reactiveVariables = new Map();
        const foundEl = document.querySelector(selector);
        if (!foundEl)
            throw Error('Root element not found');
        this.$root = foundEl;
    }
    createElement(tag, parent = this.$root) {
        const el = new ElementWrapper(tag, parent);
        return el;
    }
    declareVariable(value, dependencies) {
        const rv = new ReactiveVariable(value, dependencies);
        this.reactiveVariables.set(rv.id, rv);
        return rv;
    }
}
