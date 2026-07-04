const isObject = (val) => typeof val === "object" && val !== null;

class ImmutableHelper {
  DRAFT_STATE = Symbol();
  constructor(obj) {
    this.base = obj;
  }
  produce(recipe) {
    const { DRAFT_STATE, base } = this;
    const createDraft = (base) => {
      if (!isObject(base)) {
        return base;
      }

      const state = {
        base,
        copy: null,
        modified: false,
        drafts: new Map(),
      };

      const handler = {
        get(target, prop) {
          if (prop === DRAFT_STATE) {
            return state;
          }
          const source = state.copy ?? state.base;
          const value = source[prop];
          if (isObject(value)) {
            if (!state.drafts.has(prop)) {
              state.drafts.set(prop, createDraft(value));
            }
            return state.drafts.get(prop);
          }
          return value;
        },
        set(target, prop, value) {
          if (!state.modified) {
            state.modified = true;
            state.copy = Array.isArray(state.base)
              ? [...state.base]
              : { ...state.base };
          }
          state.copy[prop] = value;
          state.drafts.delete(prop);
          return true;
        },
      };
      return new Proxy(base, handler);
    };

    const finalize = (draft) => {
      const state = draft?.[DRAFT_STATE];
      if (!state) {
        return draft;
      }
      let hasChildChange = false;
      for (const [prop, childDraft] of state.drafts) {
        const finalized = finalize(childDraft);
        const source = state.copy ?? state.base;
        if (finalized !== source[prop]) {
          hasChildChange = true;
          if (!state.copy) {
            state.copy = Array.isArray(state.base)
              ? [...state.base]
              : { ...state.base };
          }
          state.copy[prop] = finalized;
        }
      }
      if (!state.modified && !hasChildChange) {
        return state.base;
      }
      return state.copy;
    };
    const draft = createDraft(base);
    recipe(draft);
    return finalize(draft);
  }
}

export default ImmutableHelper;
