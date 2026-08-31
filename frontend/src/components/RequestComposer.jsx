import { useChatStore } from "../store/useChatStore";

const RequestComposer = () => {
  const { openConversationId, requestBusy, respondToRequest } = useChatStore();

  return (
    <div className="shrink-0 border-t border-base-300 bg-base-100 px-4 py-4 text-center">
      <p className="text-sm font-medium">Message request</p>
      <p className="mt-1 text-xs text-base-content/60">You can read this conversation, but you must accept the request before you can reply.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={requestBusy || !openConversationId}
          onClick={() => respondToRequest(openConversationId, "reject")}
        >
          {requestBusy ? "Please wait…" : "Reject"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={requestBusy || !openConversationId}
          onClick={() => respondToRequest(openConversationId, "accept")}
        >
          {requestBusy ? "Please wait…" : "Accept"}
        </button>
      </div>
    </div>
  );
};

export default RequestComposer;
