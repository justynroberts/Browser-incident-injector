# PagerDuty Incident Simulator Scenarios Guide

## Overview
This guide explains how to create meaningful incident scenarios for the PagerDuty Incident Simulator. Each scenario can simulate real-world incident patterns with multiple events and timing.

## Scenario Structure
```json
{
  "scenarios": {
    "service-name": {
      "description": "Human-readable description of the scenario",
      "events": [
        {
          "type": "trigger|acknowledge|resolve",
          "summary": "Event summary/title",
          "source": "Component or system causing the incident",
          "severity": "critical|error|warning|info",
          "delay": 0,
          "custom_details": {
            "error_code": "Optional error code",
            "affected_users": "Count or description",
            "impact": "Business impact description"
          }
        }
      ]
    }
  }
}
```

## Example Scenarios

### 1. Database Service Degradation
```json
{
  "scenarios": {
    "mysql-primary": {
      "description": "Database performance degradation followed by connection failures",
      "events": [
        {
          "type": "trigger",
          "summary": "High Database Latency Detected",
          "source": "MySQL Primary Instance",
          "severity": "warning",
          "delay": 0,
          "custom_details": {
            "latency": "500ms",
            "affected_queries": "SELECT operations",
            "impact": "Increased response times for user transactions"
          }
        },
        {
          "type": "trigger",
          "summary": "Database Connection Pool Exhausted",
          "source": "MySQL Primary Instance",
          "severity": "critical",
          "delay": 300,
          "custom_details": {
            "error_code": "ECONNREFUSED",
            "max_connections": "100/100 used",
            "impact": "Unable to process new user transactions"
          }
        }
      ]
    }
  }
}
```

### 2. API Service Cascade Failure
```json
{
  "scenarios": {
    "payment-api": {
      "description": "Payment API timeout leading to service degradation",
      "events": [
        {
          "type": "trigger",
          "summary": "Payment API Response Time Exceeded",
          "source": "Payment Gateway Service",
          "severity": "warning",
          "delay": 0,
          "custom_details": {
            "response_time": "2500ms",
            "threshold": "1000ms",
            "impact": "Delayed payment processing"
          }
        },
        {
          "type": "trigger",
          "summary": "Payment Processing Queue Backup",
          "source": "Payment Queue Service",
          "severity": "error",
          "delay": 180,
          "custom_details": {
            "queue_size": "1000+",
            "processing_rate": "10/sec",
            "impact": "Payment confirmation delays"
          }
        },
        {
          "type": "trigger",
          "summary": "Payment System Circuit Breaker Triggered",
          "source": "Payment Gateway Service",
          "severity": "critical",
          "delay": 300,
          "custom_details": {
            "error_rate": "75%",
            "circuit": "OPEN",
            "impact": "All payment processing halted"
          }
        }
      ]
    }
  }
}
```

### 3. Frontend Service Error Spike
```json
{
  "scenarios": {
    "web-frontend": {
      "description": "Frontend error spike with authentication service impact",
      "events": [
        {
          "type": "trigger",
          "summary": "Increased Client-Side JS Errors",
          "source": "Frontend Monitoring",
          "severity": "warning",
          "delay": 0,
          "custom_details": {
            "error_rate": "5% of requests",
            "affected_component": "Authentication Widget",
            "impact": "Users experiencing login issues"
          }
        },
        {
          "type": "trigger",
          "summary": "Authentication Service 5xx Errors",
          "source": "Auth Service",
          "severity": "critical",
          "delay": 120,
          "custom_details": {
            "error_code": "HTTP 503",
            "affected_users": "All new login attempts",
            "impact": "Unable to authenticate new sessions"
          }
        }
      ]
    }
  }
}
```

## Best Practices

1. **Service-Based Grouping**
   - Use service names as scenario group names (e.g., "mysql-primary", "payment-api")
   - This helps organize incidents by affected system

2. **Meaningful Descriptions**
   - Include clear, detailed descriptions that explain the incident pattern
   - Describe the expected progression of events

3. **Event Timing**
   - Use `delay` to create realistic incident progression
   - Times are in seconds from the start of the scenario
   - Example: 300 = 5 minutes after scenario start

4. **Custom Details**
   - Include relevant metrics and thresholds
   - Specify business impact
   - Add error codes when applicable

5. **Severity Levels**
   - warning: Potential issues that need attention
   - error: Serious issues affecting service
   - critical: Severe issues requiring immediate response

## Using with LLMs

When asking an LLM to generate scenarios, provide context about:

1. The service or system you want to simulate
2. Typical failure modes or incidents
3. Key metrics and thresholds
4. Business impact considerations

Example prompt:
```
Create a PagerDuty incident scenario for a microservice-based e-commerce system where:
- The service name is "order-processing"
- The incident starts with increased order processing time
- It escalates to failed orders
- Include relevant metrics and business impact
```

The LLM can then generate a properly structured scenario following these patterns and best practices.