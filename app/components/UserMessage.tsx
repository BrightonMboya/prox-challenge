export default function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-[#1a1a1f] px-4 py-2.5 text-[15px] text-white">
        {content}
      </div>
    </div>
  );
}
