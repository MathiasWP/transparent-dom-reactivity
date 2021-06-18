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
 * Down below is an example of how some code could be compiled into using this approach:
 *
 * #### EXAMPLE START
 * A very, very simple example; the following example code (heavily inspired by Svelte):
 * <script>
 *      let myId = 'foo':
 *      let greeting = 'Hello world';
 *      setTimeout(() => {myId = 'bar'}, 1000);
 * 
 *      function changeText() {
 *          world = 'Hello universe'
 *      }
 * </script>
 * <div id={myId} onclick={changeText}>
 *      <span>{greeting}</span>
 * </div>
 * 
 * could for example be translated into the following code by this "engine" (note: simplified for readibility):
 * (also note that this example is not very accurate/optimal, mainly because of point 2 on the TODO list below)
 * 
 * const myId = new Variable('foo);
 * const greeting = new Variable('Hello world');
 * setTimeout(() => {myId.value = 'bar'}, 1000);
 * function changeText() {
 *      world.value = 'Hello universe';
 * }
 * 
 * const div = app.createElement('div');
 * div.setAttribute('id', myId);
 * div.addEventListener('click', changeText);
 * const span = app.createElement('span', div);
 * span.setInnerHTML(greeting);
 * 
 * #### EXAMPLE END
 *
 * Important note: I am not saying that this is anywhere near the elegancy and insanity of frameworks like Svelte, Vue or React. This is a hobby project, and i am doing this to have fun.
 * 
 * **TODO**
 * 1. Make children components be aware of when they are unmounted if they didn't perform the unmount themselves (e.g: changing the innerHTML in any parent component)
 * 2. Figure out how frameworks change Text (nodes)
 * 3. Make the ReactiveVariable much more reactive (currently you have to re-declare it for it to spot the change). Support for just changing a property in an object, or maybe just using "push" on an array in an ReactiveVariable could be nice
 * 4. General performance enhancements (remove e.g: remove use of forEach)
 * 5. A shit ton more i haven't thought of
 */

// Couple of global things
let globalVariableId = 0; // Necessary
const allReactiveVariables: Map<number, ReactiveVariable> = new Map(); // Maybe useful

type anyFunction = (...args: any) => any

/**
 * @description A reactive wrapper for variables.
 * Only a ReactiveVariable will cause changes on a ElementWrapper.
 */
 class ReactiveVariable {
    // All actions to perform when the variable changes
    // [ElementWrapper, action-callback, action-uid, action-parameters]
    actions: ([ElementWrapper, anyFunction, string, any[]])[] = [];
    id: number
    private _value: any

    constructor(value: any) {
        this.id = globalVariableId++;
        this._value = value;
        this.addToGlobalStorage();
    }
    
    private addToGlobalStorage(): void {
        allReactiveVariables.set(this.id, this);
    }

    set value(val: any) {
        this._value = val;
        this.triggerChangeChain();
    }

    get value(): any {
        return this._value;
    }

    addAction(ew: ElementWrapper, action: anyFunction, id: string, actionParams: any[]): void {
        this.actions.push([ew, action,  id, actionParams]);
    }

    performAllActionsFromLinkedElementWrappers(): void {
        this.actions.forEach(action => { if(action[0].isMounted) action[1](...action[3])});
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
    private valueBindings: Map<string, ReactiveVariable> = new Map();
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
        this.$parentRawEl.appendChild(this.$el);
        // this.liveChildren = this.$el.children;
        this.mounted = true;
        if(this.mountedCb) await this.mountedCb();
    }

    async unmount(): Promise<void> {
        if(!this.mounted) return console.warn('HTMLElement already unmounted');
        if(this.beforeUnmountCb) await this.beforeUnmountCb();
        this.$parentRawEl.removeChild(this.$el);
        this.mounted = false;
        if(this.unmountedCb) await this.unmountedCb();
        this.cleanUpGarbage();
    }

    private cleanUpGarbage(): void {
        // Removing any active event-listeners
        this.activeEventListeners.forEach((options: [anyFunction, any[]], event: string) => this.$el.removeEventListener(event, options[0], ...options[1]))
    }

    /**
     * @description Binding this element to a reactive variable.
     */
    private addActionAndElementToReactiveVariable(bindingId: string, rv: ReactiveVariable, action: anyFunction, actionParams: any[]): void {
        this.valueBindings.set(bindingId, rv);
        rv.addAction(this, action.bind(this), bindingId, actionParams);
    }

    /**
     * @description Returning the "actual" value wanted and binding this element if the value is reactive
     */
    private extractRawValueAndBindIfReactiveVariable(uid: string, val: any | ReactiveVariable, action: anyFunction, actionParams: any[]): any {
        if(val instanceof ReactiveVariable) {
            const bindingId = val.id + uid;
            if(!this.valueBindings.has(bindingId)) this.addActionAndElementToReactiveVariable(bindingId, val, action, actionParams)
            return val.value;
        } else return val;
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
     * @description These are all the mutations that can be performed in a component.
     * If the val is a ReactiveVariable then the mutation will be fired every time the ReactiveVariable is changed.
     */

    /**
     * @description This function should be used for all types of attributes
     */
    setAttribute(attr: string, val: any | ReactiveVariable): void {
        const uid = attr + 'attr';
        const attribute = this.extractRawValueAndBindIfReactiveVariable(uid, val, this.setAttribute, [attr, val]);
        this.$el.setAttribute(attr, attribute);
    }

    /**
     * @description danger danger ;)
     */
    setInnerHTML(text: string | ReactiveVariable): void {
        const uid = 'ihtml';
        const innerHTML = this.extractRawValueAndBindIfReactiveVariable(uid, text, this.setInnerHTML, [text]);
        this.$el.innerHTML = innerHTML;
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