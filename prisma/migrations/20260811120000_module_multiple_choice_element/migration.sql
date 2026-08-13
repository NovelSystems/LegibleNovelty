-- Add a positioned multiple-choice element type for the Module Editor (mockup
-- v6). Additive enum value only. On PostgreSQL 12+ (this project pins 17),
-- ALTER TYPE ... ADD VALUE is allowed inside the per-migration transaction as
-- long as the new value is not USED in the same transaction (it isn't here).
ALTER TYPE "ModuleElementType" ADD VALUE 'multiple_choice';
