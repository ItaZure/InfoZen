import { useState } from 'react';

const ImagePreview = ({ images, onRemove }) => {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap p-3 border-b border-border bg-muted/30">
      {images.map((image, index) => (
        <div
          key={index}
          className="relative group w-20 h-20 rounded-md overflow-hidden border border-border bg-card"
        >
          <img
            src={image}
            alt={`Preview ${index + 1}`}
            className="w-full h-full object-cover"
          />
          <button
            onClick={() => onRemove(index)}
            className="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
          >
            <span className="text-accent-foreground text-2xl font-bold">×</span>
          </button>
        </div>
      ))}
    </div>
  );
};

export default ImagePreview;
