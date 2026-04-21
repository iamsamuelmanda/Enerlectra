# Enerlectra OCR build session
Built with Cursor and Claude while iterating on Enerlectra’s OCR pipeline.

## Project goal
Build a meter-reading OCR pipeline for Enerlectra that can handle low-quality photos, extract kWh readings, and fail gracefully when confidence is low.

## Context
- Product: Enerlectra.
- Feature: Telegram-based meter reading OCR for electricity meters.
- Stack: TypeScript, Tesseract.js, Claude vision fallback, Supabase, Telegram bot.

## Session transcript

### 1) Problem definition
I need an OCR system that can read electricity meter photos submitted through Telegram. The images are often low quality, slightly rotated, or have glare, so the system needs to be robust rather than just “best effort.” It should extract the main cumulative kWh reading and support real-world settlement workflows, not just display text.

### 2) Architecture design
I designed the OCR pipeline as a fallback chain:
1. Tesseract runs first for local, low-cost OCR.
2. Claude vision runs second when Tesseract confidence is low or the result is uncertain.
3. Manual entry is used when both OCR paths fail or credits are unavailable.

The reason for this design is that meter photos are unpredictable. A single OCR model is not reliable enough, so I wanted a system that could keep working even when one step fails.

### 3) Implementation details
I built meter-specific preprocessing to improve OCR accuracy on LCD and 7-segment displays. The image pipeline converts to greyscale, normalizes contrast, boosts edges, and outputs PNG for better OCR quality.

I also added parsing logic for numeric strings, since meter readings can contain commas, decimal points, or mixed formatting. The parser tries to normalize values instead of assuming one fixed format.

To make the system safer, I added sanity checks so readings outside expected bounds or with impossible jumps are rejected or reviewed.

### 4) Reliability and fallback behavior
A key design choice was to make Claude fallback results always require human review before saving. That way, the model can help extract a reading, but it never silently writes a potentially wrong value into the database.

I also added graceful degradation for API or credit failures. If Claude is unavailable or quota is exhausted, the bot asks the user to enter the reading manually instead of breaking the workflow.

### 5) Production considerations
I added caching so repeated reads for the same image do not cost extra compute or API calls. I also added metrics and logging so OCR performance can be monitored in production.

The system uses a worker scheduler for Tesseract, and workers are recycled after a set age to avoid stale long-running processes. This helps keep the OCR service stable over time.

### 6) Result
The final OCR service processed 20+ real meter readings and is already being used in the Telegram bot workflow. It is designed for low-quality field images, supports human review, and degrades safely when external AI services are unavailable.

## What this feature does
- Reads electricity meter photos from Telegram.
- Extracts kWh values with OCR.
- Falls back to Claude when Tesseract confidence is low.
- Forces human review for uncertain results.
- Degrades gracefully to manual entry if AI credits are unavailable.

## Why this matters
This feature is a core part of Enerlectra because it turns physical meter photos into verified readings that can be settled through mobile money.