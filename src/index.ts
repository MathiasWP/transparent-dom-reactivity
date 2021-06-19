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

// Couple of global things
let globalVariableId = 0;
let globalTextNodeId = 0;
const allReactiveVariables: Map<number, ReactiveVariable> = new Map(); // Not used, but maybe useful
const allGlobalTextNodes: Map<number, Text> = new Map(); 

type anyFunction = (...args: any) => any
type conditionFunction = () => boolean
type actionData = { ew: ElementWrapper | null, action: anyFunction, bindingId: string | number, actionParams: any, transparentAction: boolean }

class returnValueFunction {
    private valueFunction: anyFunction

    constructor(valueFunction: anyFunction) {
        this.valueFunction = valueFunction
    }

    getValue(): any {
        return this.valueFunction()
    }
}

/**
 * @description A reactive wrapper for variables.
 * Only a ReactiveVariable will cause changes on a ElementWrapper.
 */
 class ReactiveVariable {
    actions: actionData[] = [];
    id: number
    private _value: any

    constructor(value: unknown | returnValueFunction | ReactiveVariable, dependencies?: ReactiveVariable[]) {
        this.id = globalVariableId++;
        this.setValue(value, dependencies)
        this.addToGlobalStorage();
    }
    
    private addToGlobalStorage(): void {
        allReactiveVariables.set(this.id, this);
    }

    private reactToDependencies(dependencies: ReactiveVariable[]): void {
        dependencies.forEach(rv => rv.addAction(null, this.setValue.bind(this), `${this.id}-1`, [this._value], true))
        dependencies.forEach(rv => rv.addAction(null, this.performAllActionsFromLinkedElementWrappers.bind(this), `${this.id}-2`, [], true))
    }

    setValue(value: unknown | returnValueFunction | ReactiveVariable, dependencies?: ReactiveVariable[]): void {
        this._value = value;
        if(dependencies) this.reactToDependencies(dependencies)
        this.triggerChangeChain();
    }

    set value(val: any) {
        this.setValue(val)
    }

    get value(): any {
        return this._value instanceof returnValueFunction ? this._value.getValue() : this._value instanceof ReactiveVariable ? this._value.value : this._value;
    }

    addAction(ew: ElementWrapper | null, action: anyFunction, bindingId: string | number, actionParams: any[], transparentAction = false): void {
        this.actions.push({ew, action, bindingId, actionParams, transparentAction});
    }

    removeAction(bindingId: string | number): void {
        this.actions = this.actions.filter(a => a.bindingId !== bindingId)
    }

    performAllActionsFromLinkedElementWrappers(): void {
        this.actions.forEach(action => {
            if(action.transparentAction || (!action.transparentAction && action.ew?.isMounted)) action.action(...action.actionParams)
        });
    }

    triggerChangeChain(): void {
        this.performAllActionsFromLinkedElementWrappers()
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
    private readonly $el: HTMLElement;
    private readonly parent: HTMLElement | ElementWrapper
    private reactiveVariableBindings: Map<string, ReactiveVariable> = new Map();
    private mounted = false;
    private beforeMountCb?: anyFunction;
    private mountedCb?: anyFunction;
    private beforeUnmountCb?: anyFunction;
    private unmountedCb?: anyFunction;
    private activeEventListeners: Map<string, [anyFunction, any[]]> = new Map();
    // private liveChildren?: HTMLCollection;

    constructor(tag: string, parent: HTMLElement | ElementWrapper) {
        this.$el = document.createElement(tag);
        this.parent = parent;
    }

    /**
     * @description We do not use any "virtual dom" to perform changes in the dom, so all we could need rom the parent is its HTMLElement
     */
    get $parentRawEl(): HTMLElement {
        return this.parent instanceof ElementWrapper ? this.parent.$el : this.parent;
    }

    get trueMounted(): boolean {
        return this.$el.isConnected;
    }

    get isMounted(): boolean {
        return this.mounted
    }

    /**
     * @description Adding some lifecycle-methods. These can be async.
     */
    public onBeforeMount(cb: anyFunction): void { this.beforeMountCb = cb; }
    public onMount(cb: anyFunction): void { this.mountedCb = () => cb(this.$el); }
    public onBeforeUnmount(cb: anyFunction): void { this.beforeUnmountCb = () => cb(this.$el); }
    public onUnmount(cb: anyFunction): void { this.unmountedCb = cb; }

    async mount(): Promise<void> {
        if(this.mounted) return console.warn('HTMLElement already mounted')
        if(this.beforeMountCb) await this.beforeMountCb();
        this.addToDOM();
        // this.liveChildren = this.$el.children;
        this.mounted = true;
        if(this.mountedCb) await this.mountedCb();
    }

    async unmount(): Promise<void> {
        if(!this.mounted) return console.warn('HTMLElement already unmounted');
        if(this.beforeUnmountCb) await this.beforeUnmountCb();
        this.removeFromDOM();
        this.mounted = false;
        if(this.unmountedCb) await this.unmountedCb();
        this.cleanUpGarbage();
    }

    private addToDOM(): void {
        this.$parentRawEl.appendChild(this.$el);
    }
    
    private removeFromDOM(): void {
        this.$parentRawEl.removeChild(this.$el);
    }

    private cleanUpGarbage(): void {
        // Removing any active event-listeners
        this.activeEventListeners.forEach((options: [anyFunction, any[]], event: string) => this.$el.removeEventListener(event, options[0], ...options[1]))
    }

    /**
     * @description Binding a ReactiveVariable to an action from this ElementWrapper
     */
    private bindReactiveVariable(bindingId: string, rv: ReactiveVariable, action: anyFunction, actionParams: any[], transparentAction?: boolean): any {
        if(this.reactiveVariableBindings.has(bindingId)) return console.warn('Tried to bind ReactiveVariable with and existing binding-id')
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
    private bindReactiveVariablesToAction(actionUid: string, action: anyFunction, params: any[], bindingInfo: [ReactiveVariable[], string[]?], transparentAction?: boolean): void {
        // Little shortcut if we have already binded the action and its ReactiveVariables
        const alreadyBindedCondition = bindingInfo[1]?.every((bId: any) => this.reactiveVariableBindings.has(bId));
        if(alreadyBindedCondition) return
        
        // Will only be fired on first setup
        const reactiveVariables = bindingInfo[0];
        const createBindingId = (rv: ReactiveVariable): string => rv.id + actionUid;
        const allBindingIds = reactiveVariables.map(rv => createBindingId(rv))
        reactiveVariables.forEach((rv) => this.bindReactiveVariable(createBindingId(rv), rv, action, [...params, reactiveVariables, allBindingIds], transparentAction));
    }


    /**
     * @param conditionAction The conditionallyRender-function
     * @param params The params passed into the conditionallyRender-function
     * @description Here we bind the conditionallyRender function and all of the ReactiveVariables that it depends on.
     */
    private bindRenderConditionIfNotAlready(conditionAction: anyFunction, params: [conditionFunction, ReactiveVariable[], string[]?]): void {
        // Little shortcut if we have already binded the render-condition and its variables
        const alreadyBindedCondition = params[2]?.every(bId => this.reactiveVariableBindings.has(bId));
        if(alreadyBindedCondition) return
        
        // Will only be fired on first setup
        const reactiveVariables = params[1];
        const createBindingId = (rv: ReactiveVariable): string => rv.id + params[0].toString()
        const allBindingIds = reactiveVariables.map(rv => createBindingId(rv))
        const updatedParams = params.slice(0, 2).concat([allBindingIds]); // allBindings from the parameter is undefined on setup (because it is created here)
        reactiveVariables.forEach((rv) => this.bindReactiveVariable(createBindingId(rv), rv, conditionAction, updatedParams, true));
    }

    /**
     * @description Event-listeners (active ones are stored so they can be removed on unmount)
     */
    addEventListener(event: string, cb: anyFunction, ...rest: any): void {
        this.$el.addEventListener(event, cb, ...rest);
        this.activeEventListeners.set(event, [cb, rest])
    }

    removeEventListener(event: string, cb: anyFunction, ...rest: any): void {
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
    conditionallyRender(rawCondition: conditionFunction, rv: ReactiveVariable[], bindingIds?: string[]): void {
        this.bindRenderConditionIfNotAlready(this.conditionallyRender, [rawCondition, rv, bindingIds]);
        if(rawCondition() && !this.mounted) this.mount();
        else if(!rawCondition() && this.mounted) this.unmount();
    }

    /**
     * @description This function should be used for all types of attributes
     */
    setAttribute(attr: string, val: unknown | returnValueFunction | ReactiveVariable, rv: ReactiveVariable[] = [], bindingIds?: string[]): void {
        const actionUid = attr + 'attr';
        this.bindReactiveVariablesToAction(actionUid, this.updateAttribute, [attr, val], [rv, bindingIds]);
        this.updateAttribute(attr, val)
    }
    
    private updateAttribute(attr: string, val:  unknown | returnValueFunction | ReactiveVariable): void {
        const realValue = val instanceof returnValueFunction ? val.getValue() : val instanceof ReactiveVariable ? val.value : val;
        this.$el.setAttribute(attr, realValue);
    }

    /**
     * @description Appends and update single textNodes
     */
    appendText(text: string | returnValueFunction | ReactiveVariable, id: number = -1, rv: ReactiveVariable[] = [], bindingIds?: string[]): void {
        const realId = id < 0 ? globalTextNodeId++ : id;
        const actionUid = 'itext' + realId;
        const textNode = document.createTextNode('');
        this.bindReactiveVariablesToAction(actionUid, this.updateText, [text, textNode, false], [rv, bindingIds]);
        this.updateText(text, textNode, true);
    }

    private updateText(text: string | returnValueFunction | ReactiveVariable, textNode: Text, initialize: boolean): void {
        const realText = text instanceof returnValueFunction ? text.getValue() : text instanceof ReactiveVariable ? text.value : text;
        textNode.nodeValue = realText;
        if(initialize) this.$el.appendChild(textNode);
    }

    /**
     * @description danger danger ;)
     */
    setInnerHTML(html: unknown | returnValueFunction | ReactiveVariable, rv: ReactiveVariable[] = [], bindingIds?: string[]): void {
        const actionUid = 'ihtml'; 
        this.bindReactiveVariablesToAction(actionUid, this.updateInnerHTML, [html], [rv, bindingIds]);
        this.updateInnerHTML(html);
    }

    private updateInnerHTML(html: unknown | returnValueFunction | ReactiveVariable): void {
        const realHtml = html instanceof returnValueFunction ? html.getValue() : html instanceof ReactiveVariable ? html.value : html;
        this.$el.innerHTML = realHtml;
    }
}

/**
 * @description A very simple class for "initializing" an app.
 */
class App {
    $root: HTMLElement;

    constructor(selector: string) {
        const foundEl = (document.querySelector(selector) as HTMLElement);
        if(!foundEl) throw Error('Root element not found');
        this.$root = foundEl;
    }

    createElement(tag: string, parent = this.$root): ElementWrapper {
        const el = new ElementWrapper(tag, parent);
        return el;
    }
}