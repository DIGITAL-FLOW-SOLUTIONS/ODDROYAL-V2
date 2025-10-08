#!/bin/bash
# Start Redis server
redis-server --port 6379 --daemonize yes --protected-mode no --bind 0.0.0.0
sleep 1
redis-cli ping || echo "Redis failed to start"
