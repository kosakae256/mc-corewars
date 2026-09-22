@echo off
cd /d "%~dp0.."
python tools/pve3-rig-editor.py
if errorlevel 1 pause
