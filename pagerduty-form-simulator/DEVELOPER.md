# PagerDuty Event Definition System - Developer Documentation

## Overview

The PagerDuty Event Definition System is a JSON-based framework for orchestrating realistic incident and change scenarios. It allows you to define complex event sequences that execute automatically with proper timing, escalation patterns, and cross-team dependencies.

## Core Schema Structure

### Root Definition

```json
{
  "schema_version": "1.0",
  "description": "Optional description of this definition file",
  "event_definitions": [...],
  "global_config": {...}
}
```

### Event Definition

```json
{
  "name": "scenario_name",
  "description": "Human readable description",
  "events": [...],
  "execution": {
    "repeat_count": 1,
    "randomize_delays": false
  }
}
```

### Individual Event

```json
{
  "type": "trigger|acknowledge|resolve|change",
  "routing_key": "integration-key",
  "dedup_key": "optional-deduplication-key",
  "payload": {...},
  "delay_after": {...}
}
```

## Event Types and API Mapping

### Incident Events

Endpoint: `https://events.pagerduty.com/v2/enqueue`

#### Trigger Event

```json
{
  "type": "trigger",
  "routing_key": "service-integration-key",
  "payload": {
    "summary": "Database connection pool exhausted - {{timestamp}}",
    "source": "db-monitor.prod",
    "severity": "critical|error|warning|info",
    "component": "postgresql",
    "class": "database",
    "group": "infrastructure",
    "custom_details": {
      "pool_size": 100,
      "active_connections": 98,
      "affected_services": ["api", "web", "billing"],
      "runbook_url": "https://runbooks.company.com/db-pool"
    },
    "images": [
      {
        "src": "https://monitoring.company.com/graph.png",
        "href": "https://monitoring.company.com/dashboard",
        "alt": "Performance graph"
      }
    ],
    "links": [
      {
        "href": "https://runbooks.company.com/db-issues",
        "text": "Database Troubleshooting Guide"
      }
    ]
  },
  "delay_after": {
    "type": "fixed",
    "value": 300
  }
}
```

#### Acknowledge Event

```json
{
  "type": "acknowledge",
  "routing_key": "service-integration-key",
  "dedup_key": "db-pool-exhausted-{{timestamp}}",
  "payload": {
    "summary": "Investigating database connection issues",
    "source": "on-call-engineer"
  },
  "delay_after": {
    "type": "random",
    "min": 300,
    "max": 900
  }
}
```

#### Resolve Event

```json
{
  "type": "resolve",
  "routing_key": "service-integration-key",
  "dedup_key": "db-pool-exhausted-{{timestamp}}",
  "payload": {
    "summary": "Database pool size increased, connections stable",
    "source": "db-monitor.prod",
    "custom_details": {
      "resolution": "Increased pool size to 200",
      "downtime_duration": "15m",
      "root_cause": "Memory leak in connection pool"
    }
  }
}
```

### Change Events

Endpoint: `https://events.pagerduty.com/v2/change/enqueue`

```json
{
  "type": "change",
  "routing_key": "change-events-integration-key",
  "payload": {
    "summary": "Deploy application v3.2.1 to production",
    "source": "ci-cd-pipeline",
    "timestamp": "{{scheduled_time}}",
    "custom_details": {
      "change_type": "deployment|maintenance|configuration",
      "environment": "production",
      "version": "v3.2.1",
      "change_id": "CHG-{{random_number}}",
      "approver": "tech-lead@company.com",
      "risk_assessment": "low|medium|high|critical",
      "estimated_duration": "20 minutes",
      "affected_services": ["web-app", "api-gateway"],
      "rollback_procedure": "kubectl rollout undo deployment/web-app",
      "deployment_method": "blue-green|rolling|canary"
    },
    "links": [
      {
        "href": "https://github.com/company/app/releases/tag/v3.2.1",
        "text": "Release Notes"
      },
      {
        "href": "https://jenkins.company.com/job/deploy-prod/123",
        "text": "Build Details"
      }
    ]
  }
}
```

## Timing and Delay Configuration

### Fixed Delays

```json
{
  "delay_after": {
    "type": "fixed",
    "value": 300
  }
}
```

### Random Delays

```json
{
  "delay_after": {
    "type": "random",
    "min": 120,
    "max": 600
  }
}
```

### Exponential Backoff

```json
{
  "delay_after": {
    "type": "exponential",
    "base": 30,
    "multiplier": 2,
    "max": 300
  }
}
```

### No Delay

```json
{
  "delay_after": null
}
```

## Variables and Templates

### Built-in Variables

- `{{timestamp}}` - Current ISO8601 timestamp
- `{{current_time}}` - Same as timestamp
- `{{random_number}}` - 4-digit random number
- `{{random_4_digit}}` - 4-digit random number
- `{{scheduled_time}}` - Current time + 1 hour

### Custom Variables

```json
{
  "global_config": {
    "variables": {
      "environment": "production",
      "team_email": "oncall@company.com",
      "region": "us-west-2",
      "service_version": "v2.1.0"
    }
  }
}
```

Usage in payloads:

```json
{
  "summary": "Service {{service_version}} issue in {{environment}}",
  "custom_details": {
    "region": "{{region}}",
    "contact": "{{team_email}}"
  }
}
```

## Complete Example Scenarios

### Database Cascade Incident

```json
{
  "event_definitions": [
    {
      "name": "database_cascade_outage",
      "description": "Database failure cascading to multiple services",
      "events": [
        {
          "type": "trigger",
          "routing_key": "database-team-key",
          "payload": {
            "summary": "Primary database connection failed - {{timestamp}}",
            "source": "db-health-check.prod",
            "severity": "critical",
            "component": "postgresql-primary",
            "custom_details": {
              "database": "prod-db-01",
              "error": "Connection timeout after 30s",
              "replica_status": "healthy",
              "affected_services": ["api", "web", "billing"]
            }
          },
          "delay_after": {
            "type": "fixed",
            "value": 180
          }
        },
        {
          "type": "trigger",
          "routing_key": "api-team-key",
          "payload": {
            "summary": "API error rate spike - database dependency failure",
            "source": "api-gateway.prod",
            "severity": "warning",
            "component": "user-api",
            "custom_details": {
              "error_rate": "85%",
              "normal_error_rate": "0.1%",
              "upstream_dependency": "database",
              "affected_endpoints": ["/users", "/auth", "/billing"]
            }
          },
          "delay_after": {
            "type": "random",
            "min": 60,
            "max": 300
          }
        },
        {
          "type": "acknowledge",
          "routing_key": "database-team-key",
          "dedup_key": "db-outage-{{timestamp}}",
          "payload": {
            "summary": "Database team investigating primary DB failure",
            "source": "dba-oncall"
          },
          "delay_after": {
            "type": "random",
            "min": 600,
            "max": 900
          }
        },
        {
          "type": "resolve",
          "routing_key": "database-team-key",
          "dedup_key": "db-outage-{{timestamp}}",
          "payload": {
            "summary": "Failed over to replica, primary DB restored",
            "source": "db-health-check.prod",
            "custom_details": {
              "resolution": "Automatic failover + primary restart",
              "downtime": "18 minutes",
              "root_cause": "Memory leak in connection pool"
            }
          },
          "delay_after": {
            "type": "fixed",
            "value": 120
          }
        },
        {
          "type": "resolve",
          "routing_key": "api-team-key",
          "payload": {
            "summary": "API error rate back to normal",
            "source": "api-gateway.prod",
            "custom_details": {
              "current_error_rate": "0.1%",
              "recovery_time": "2 minutes after DB restoration"
            }
          }
        }
      ],
      "execution": {
        "repeat_count": 1,
        "randomize_delays": false
      }
    }
  ]
}
```

### Deployment Scenario with Change Events

```json
{
  "event_definitions": [
    {
      "name": "production_deployment",
      "description": "Production deployment with change tracking",
      "events": [
        {
          "type": "change",
          "routing_key": "change-events-key",
          "payload": {
            "summary": "Starting deployment: User service v2.1.0",
            "source": "github-actions",
            "timestamp": "{{timestamp}}",
            "custom_details": {
              "change_type": "deployment",
              "environment": "production",
              "version": "v2.1.0",
              "change_id": "CHG-2025-{{random_number}}",
              "approver": "engineering-manager@company.com",
              "risk_assessment": "medium",
              "estimated_duration": "15 minutes",
              "features": [
                "New authentication flow",
                "Performance improvements",
                "Profile update bug fixes"
              ],
              "rollback_plan": "Blue-green deployment rollback"
            },
            "links": [
              {
                "href": "https://github.com/company/user-service/releases/v2.1.0",
                "text": "Release Notes"
              }
            ]
          },
          "delay_after": {
            "type": "fixed",
            "value": 900
          }
        },
        {
          "type": "change",
          "routing_key": "change-events-key",
          "payload": {
            "summary": "Deployment completed: User service v2.1.0",
            "source": "github-actions",
            "custom_details": {
              "change_id": "CHG-2025-{{random_number}}",
              "status": "completed",
              "actual_duration": "13 minutes",
              "success": true,
              "post_deployment_tests": "all passed",
              "performance_impact": "Response time improved 15%"
            }
          }
        }
      ]
    }
  ]
}
```

### Security Incident Scenario

```json
{
  "event_definitions": [
    {
      "name": "security_incident",
      "description": "Security incident with escalation",
      "events": [
        {
          "type": "trigger",
          "routing_key": "security-team-key",
          "payload": {
            "summary": "Suspicious login attempts detected - {{timestamp}}",
            "source": "security-monitor.prod",
            "severity": "warning",
            "component": "authentication-service",
            "class": "security",
            "custom_details": {
              "attack_type": "brute_force",
              "source_ips": ["203.0.113.45", "198.51.100.78"],
              "failed_attempts": 1247,
              "affected_accounts": 23,
              "time_window": "last 10 minutes",
              "geographical_anomaly": true
            }
          },
          "delay_after": {
            "type": "fixed",
            "value": 600
          }
        },
        {
          "type": "trigger",
          "routing_key": "security-team-key",
          "payload": {
            "summary": "Rate limiting activated - blocking suspicious IPs",
            "source": "waf.prod",
            "severity": "info",
            "component": "web-application-firewall",
            "custom_details": {
              "blocked_ips": ["203.0.113.45", "198.51.100.78"],
              "rate_limit_threshold": "100 requests/minute",
              "automatic_response": true
            }
          },
          "delay_after": {
            "type": "fixed",
            "value": 300
          }
        },
        {
          "type": "resolve",
          "routing_key": "security-team-key",
          "payload": {
            "summary": "Brute force attack mitigated - monitoring continues",
            "source": "security-monitor.prod",
            "custom_details": {
              "resolution": "IPs blocked, accounts secured",
              "duration": "15 minutes",
              "affected_users_notified": true,
              "additional_monitoring": "24 hours"
            }
          }
        }
      ]
    }
  ]
}
```

### Load Test Monitoring

```json
{
  "event_definitions": [
    {
      "name": "load_test_monitoring",
      "description": "Expected alerts during load testing",
      "events": [
        {
          "type": "trigger",
          "routing_key": "performance-team-key",
          "payload": {
            "summary": "High resource usage - load test in progress",
            "source": "load-test-monitor",
            "severity": "info",
            "component": "web-servers",
            "custom_details": {
              "cpu_usage": "85%",
              "memory_usage": "78%",
              "load_test_phase": "peak_load",
              "concurrent_users": 5000,
              "expected_behavior": true,
              "baseline_cpu": "15%"
            }
          },
          "delay_after": {
            "type": "random",
            "min": 60,
            "max": 180
          }
        },
        {
          "type": "resolve",
          "routing_key": "performance-team-key",
          "payload": {
            "summary": "Load test completed - resources back to normal",
            "source": "load-test-monitor",
            "custom_details": {
              "final_cpu": "12%",
              "test_duration": "45 minutes",
              "peak_concurrent_users": 5000,
              "performance_results": "within acceptable thresholds"
            }
          }
        }
      ],
      "execution": {
        "repeat_count": 3,
        "randomize_delays": true
      }
    }
  ]
}
```

## Global Configuration Options

```json
{
  "global_config": {
    "base_delay_seconds": 0,
    "randomization_factor": 0.2,
    "default_severity": "warning",
    "default_source": "event-simulator",
    "variables": {
      "environment": "production",
      "region": "us-west-2",
      "team_email": "oncall@company.com",
      "company_name": "Acme Corp"
    },
    "routing_key_mappings": {
      "database": "db-team-integration-key",
      "api": "api-team-integration-key",
      "frontend": "frontend-team-integration-key",
      "security": "security-team-integration-key",
      "changes": "change-management-key"
    }
  }
}
```

## Execution Configuration

```json
{
  "execution": {
    "repeat_count": 5,
    "randomize_delays": true,
    "parallel_execution": false,
    "stop_on_error": false,
    "max_concurrent_events": 1
  }
}
```

## API Field Reference

### Incident Event Fields

- **Required**: summary, source, routing_key, event_action
- **Optional**: severity, component, group, class, custom_details, images, links, dedup_key

### Change Event Fields

- **Required**: summary, source, routing_key
- **Optional**: timestamp, custom_details, links

### Severity Levels

- **critical** - Service completely down
- **error** - Major functionality impacted
- **warning** - Minor issues or degradation
- **info** - Informational events

## Best Practices

### Naming Conventions

- Use descriptive scenario names: `database_cascade_outage` vs `test1`
- Include service/component in routing keys: `api-team-prod-key`
- Use consistent dedup_key patterns: `incident-type-{{timestamp}}`

### Realistic Data

- Include actual service names and error messages
- Use proper severity levels based on business impact
- Add meaningful custom_details for troubleshooting context
- Reference real runbooks and documentation

### Timing Considerations

- Model realistic human response times (5-15 minutes)
- Account for escalation delays (15-30 minutes)
- Use randomization to avoid predictable patterns
- Consider time zones and business hours

### Security and Operations

- Never include sensitive data in payloads
- Use test routing keys for non-production scenarios
- Version control definition files
- Document scenario purposes and expected outcomes