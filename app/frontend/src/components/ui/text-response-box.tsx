import React from "react";
import "./text-response-box.css";

interface TextResponseBoxProps {
  text: string;
}

const TextResponseBox: React.FC<TextResponseBoxProps> = ({ text }) => {
  return (
    <div className="text-response-box mb-4 p-4 bg-white rounded shadow text-lg text-left max-w-xl w-full border border-gray-300">
      <label className="block mb-2 font-semibold text-gray-700">Model Response:</label>
      <textarea
        className="w-full h-32 p-2 border border-gray-300 rounded resize-none bg-gray-50 text-gray-900"
        value={text || "No response yet."}
        readOnly
      />
    </div>
  );
};

export default TextResponseBox;
