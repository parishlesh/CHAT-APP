const MessageSkeleton = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-4 py-4">
      <div className="h-10 w-2/5 animate-pulse rounded-lg rounded-bl-none bg-base-300" />
      <div className="ml-auto h-12 w-1/2 animate-pulse rounded-lg rounded-br-none bg-base-300" />
      <div className="h-8 w-1/3 animate-pulse rounded-lg rounded-bl-none bg-base-300" />
      <div className="ml-auto h-16 w-3/5 animate-pulse rounded-lg rounded-br-none bg-base-300" />
    </div>
  );
};

export default MessageSkeleton;
