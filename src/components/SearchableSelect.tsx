import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  allowCustom?: boolean;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccione una opción...",
  className = "",
  disabled = false,
  id,
  allowCustom = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find currently selected option to show its label
  const selectedOption = options.find((opt) => opt.value === value);

  // Sync searchTerm when selectedOption or focus state changes
  useEffect(() => {
    if (!isFocused) {
      setSearchTerm(selectedOption ? selectedOption.label : (value || ""));
    }
  }, [value, selectedOption, isFocused]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter options based on search term
  // If user hasn't typed anything or is showing default, match all or filtered
  const filteredOptions = options.filter((option) => {
    // If the input has the exact label of the selected option and the user hasn't modified it yet,
    // we can show all options when they click, OR if they start typing (which changes the term), we filter.
    const isShowingExactSelected = selectedOption && searchTerm === selectedOption.label;
    if (isShowingExactSelected && !isFocused) {
      return true;
    }
    
    // Default search filtering: match substring case-insensitive
    return option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
           option.value.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleInputFocus = () => {
    if (disabled) return;
    setIsFocused(true);
    setIsOpen(true);
    // Select all text on focus so user can immediately type to overwrite
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (allowCustom && searchTerm.trim()) {
        const uppercaseVal = searchTerm.trim().toUpperCase();
        onChange(uppercaseVal);
        setIsOpen(false);
        setIsFocused(false);
        inputRef.current?.blur();
      } else if (filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0].value);
      }
    }
  };

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    setIsFocused(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} id={id}>
      <div
        className={`flex items-center gap-1 bg-slate-50 border rounded-xl px-2.5 py-1.5 transition-all text-xs ${
          disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : "cursor-text hover:bg-white"
        } ${isOpen ? "border-brand-primary bg-white ring-1 ring-brand-primary/20" : "border-blue-100"}`}
        onClick={() => inputRef.current?.focus()}
      >
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent border-none outline-none p-0 text-slate-700 font-bold placeholder:text-slate-400 placeholder:font-normal"
        />
        {searchTerm && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-blue-100 rounded-xl shadow-xl max-h-56 overflow-y-auto animate-fadeIn py-1">
          {filteredOptions.length === 0 ? (
            allowCustom && searchTerm.trim() ? (
              <button
                type="button"
                onClick={() => handleSelectOption(searchTerm.trim().toUpperCase())}
                className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between font-bold text-brand-primary hover:bg-slate-50"
              >
                <span>+ Usar "{searchTerm.trim().toUpperCase()}"</span>
              </button>
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 italic text-center">
                No se encontraron opciones
              </div>
            )
          ) : (
            <>
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectOption(option.value)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between font-bold ${
                      isSelected
                        ? "bg-brand-primary text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">
                        Activo
                      </span>
                    )}
                  </button>
                );
              })}
              {allowCustom && searchTerm.trim() && !options.some(opt => opt.label.toUpperCase() === searchTerm.trim().toUpperCase()) && (
                <button
                  type="button"
                  onClick={() => handleSelectOption(searchTerm.trim().toUpperCase())}
                  className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between font-bold text-brand-primary hover:bg-slate-50 border-t border-slate-100"
                >
                  <span>+ Usar "{searchTerm.trim().toUpperCase()}"</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
