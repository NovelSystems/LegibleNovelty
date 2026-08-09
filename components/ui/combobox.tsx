"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type ComboItem = { value: string; label: string };

// A shadcn combobox (Popover + Command). Drives filtering externally
// (shouldFilter=false) via onQueryChange, so the same component serves both a
// locally-filtered list (Topic) and an async server search (Prerequisite seed).
//   • allowCustom  — offer "Create '<query>'" when the query matches nothing
//                    (Topic is create-on-the-fly).
//   • clearable    — offer a "Clear selection" row (Prerequisite is optional).
export function Combobox({
  items,
  value,
  displayLabel,
  onSelect,
  onQueryChange,
  onOpen,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  createLabel = (q) => `Create “${q}”`,
  allowCustom = false,
  clearable = false,
  disabled = false,
  id,
}: {
  items: ComboItem[];
  value: string;
  displayLabel?: string;
  onSelect: (value: string, label: string) => void;
  onQueryChange?: (query: string) => void;
  onOpen?: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  createLabel?: (query: string) => string;
  allowCustom?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedLabel = value
    ? (items.find((i) => i.value === value)?.label ?? displayLabel ?? value)
    : "";

  const trimmed = query.trim();
  const showCreate =
    allowCustom &&
    trimmed !== "" &&
    !items.some((i) => i.label.toLowerCase() === trimmed.toLowerCase());

  function choose(v: string, label: string) {
    onSelect(v, label);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen?.();
        else setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={(q) => {
              setQuery(q);
              onQueryChange?.(q);
            }}
          />
          <CommandList>
            {items.length === 0 && !showCreate && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            {clearable && value && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => choose("", "")}>
                  <X className="opacity-60" />
                  <span className="text-muted-foreground">Clear selection</span>
                </CommandItem>
              </CommandGroup>
            )}
            {items.length > 0 && (
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={() => choose(item.value, item.label)}
                  >
                    <Check
                      className={cn(value === item.value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => choose(trimmed, trimmed)}
                >
                  <Plus />
                  <span className="truncate">{createLabel(trimmed)}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
