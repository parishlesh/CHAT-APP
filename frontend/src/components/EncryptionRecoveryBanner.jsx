import { useAuth } from "../store/useAuth";

const EncryptionRecoveryBanner = () => {
  const {
    encryptionFailure,
    encryptionReady,
    canResetEncryption,
    isResettingEncryption,
    resetUnrecoverableEncryption,
  } = useAuth();

  if (encryptionReady || encryptionFailure !== "KEY_BACKUP_REQUIRED") return null;

  const confirmReset = () => {
    const ok = window.confirm(
      "This device does not have your encryption key, and there is no recoverable backup on the server. Creating new keys lets you send and receive new messages, but older messages encrypted for the previous key cannot be decrypted. Continue?"
    );
    if (ok) resetUnrecoverableEncryption();
  };

  return (
    <div className="shrink-0 border-b border-warning/40 bg-warning/15 px-4 py-3 text-sm">
      <p className="font-medium text-warning-content">Messages on this device are locked.</p>
      {canResetEncryption ? (
        <>
          <p className="mt-1 text-base-content/80">
            Your private key is not on this browser, and the server has no wrapped backup. If you still have another signed-in device, log in there first so it can upload a backup. Otherwise you can start a new encryption identity here.
          </p>
          <button
            type="button"
            className="btn btn-warning btn-sm mt-2"
            disabled={isResettingEncryption}
            onClick={confirmReset}
          >
            {isResettingEncryption ? "Creating keys…" : "Create new encryption keys"}
          </button>
        </>
      ) : (
        <p className="mt-1 text-base-content/80">
          Sign out and sign in with your password if you want to create new keys on this device. Password is required so the new private key can be backed up.
        </p>
      )}
    </div>
  );
};

export default EncryptionRecoveryBanner;
