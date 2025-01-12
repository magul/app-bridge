import { SSR } from "./constants";
import { Events, EventType, PayloadOfEvent } from "./events";

type State = {
  token?: string;
  ready: boolean;
  domain: string;
};
type EventCallback<TPayload extends {} = {}> = (data: TPayload) => void;
type SubscribeMap = {
  [type in EventType]: Record<any, EventCallback<PayloadOfEvent<type>>>;
};

function reducer(state: State, event: Events) {
  switch (event.type) {
    case EventType.handshake: {
      const newState = {
        ...state,
        ready: true,
        token: event.payload.token,
      };

      return newState;
    }
    default: {
      return state;
    }
  }
}

export const app = (() => {
  if (SSR) {
    console.warn(
      "@saleor/app-bridge detected you're running this app in SSR mode. Make sure to call `createApp` when window object exists."
    );
    return null as never;
  }

  let state: State = {
    domain: "",
    ready: false,
  };
  let subscribeMap: SubscribeMap = {
    handshake: {},
    response: {},
  };
  let refererOrigin: string;

  try {
    refererOrigin = new URL(document.referrer).origin;
  } catch (e) {
    console.warn("document.referrer is empty");
  }

  window.addEventListener(
    "message",
    // Generic MessageEvent is not supported by tsdx's TS version
    ({ origin, data }: Omit<MessageEvent, "data"> & { data: Events }) => {
      // check if event origin matches the document referer
      if (origin !== refererOrigin) {
        return;
      }

      // compute new state
      state = reducer(state, data);

      // run callbacks
      const { type, payload } = data;
      if (EventType.hasOwnProperty(type)) {
        Object.getOwnPropertySymbols(subscribeMap[type]).forEach(key =>
          // @ts-ignore
          subscribeMap[type][key](payload)
        );
      }
    }
  );

  /**
   * Subscribes to an Event.
   *
   * @param eventType - Event type.
   * @param cb - Callback that executes when Event is registered. Called with Event payload object.
   * @returns Unsubscribe function. Call to unregister the callback.
   */
  function subscribe<
    TEventType extends EventType,
    TPayload extends PayloadOfEvent<TEventType>
  >(eventType: TEventType, cb: EventCallback<TPayload>) {
    const key = (Symbol() as unknown) as string; // https://github.com/Microsoft/TypeScript/issues/24587
    // @ts-ignore
    subscribeMap[eventType][key] = cb;

    return () => {
      delete subscribeMap[eventType][key];
    };
  }

  /**
   * Unsubscribe to all Events of type.
   *
   * @param eventType - (optional) Event type. If empty, all callbacks will be unsubscribed.
   */
  function unsubscribeAll(eventType?: EventType) {
    if (eventType) {
      subscribeMap[eventType] = {};
    } else {
      subscribeMap = {
        handshake: {},
        response: {},
      };
    }
  }

  /**
   * Gets current state.
   *
   * @returns State object.
   */
  function getState() {
    return state;
  }

  function setState(newState: Partial<State>) {
    state = {
      ...state,
      ...newState,
    };

    return state;
  }
  return {
    subscribe,
    unsubscribeAll,
    getState,
    setState,
  };
})();
