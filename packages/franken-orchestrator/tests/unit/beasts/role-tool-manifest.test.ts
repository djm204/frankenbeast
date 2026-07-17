import { describe, expect, it } from 'vitest';
import {
  roleToolManifests,
  validateAgentRoleTools,
} from '../../../src/beasts/services/role-tool-manifest.js';

describe('role tool manifest policy', () => {
  it('publishes only the least-privilege manifest for each role', () => {
    expect(roleToolManifests()).toEqual({
      coding: [
        'github.comment',
        'github.pr',
        'github.read',
        'kanban.comment',
        'patch',
        'read_file',
        'search_files',
        'terminal',
        'terminal.background',
        'write_file',
      ],
      docs: [
        'github.comment',
        'github.pr',
        'github.read',
        'kanban.comment',
        'read_file',
        'search_files',
        'write_file',
      ],
      doctor: [
        'github.comment',
        'github.pr',
        'github.read',
        'kanban.comment',
        'read_file',
        'search_files',
        'terminal',
      ],
      review: [
        'github.comment',
        'github.pr',
        'github.read',
        'kanban.comment',
        'read_file',
        'search_files',
        'terminal',
      ],
      'ticket-manager': [
        'github.comment',
        'github.read',
        'kanban.comment',
        'read_file',
        'search_files',
      ],
      triage: [
        'github.comment',
        'github.read',
        'kanban.comment',
        'read_file',
        'search_files',
      ],
    });

    expect(roleToolManifests()['ticket-manager']).not.toEqual(expect.arrayContaining([
      'patch',
      'terminal',
      'terminal.background',
      'write_file',
    ]));
  });

  it('rejects tools outside a role manifest while preserving allowed-tool evidence', () => {
    const validation = validateAgentRoleTools({
      agentRole: 'ticket-manager',
      requestedTools: ['read_file', 'patch', 'terminal.background'],
      skills: [],
    });

    expect(validation).toMatchObject({
      allowed: false,
      role: 'ticket-manager',
      requestedTools: ['read_file', 'patch', 'terminal.background'],
      denials: [
        expect.objectContaining({
          role: 'ticket-manager',
          requestedTool: 'patch',
          reason: expect.stringContaining("not allowed for role 'ticket-manager'"),
        }),
        expect.objectContaining({
          role: 'ticket-manager',
          requestedTool: 'terminal.background',
          reason: expect.stringContaining("not allowed for role 'ticket-manager'"),
        }),
      ],
    });
  });

  it('fails closed for unknown roles, missing roles, missing manifests, and implicit skills', () => {
    expect(validateAgentRoleTools({
      agentRole: 'issue-worker',
      requestedTools: ['read_file'],
      skills: [],
    })).toMatchObject({
      allowed: false,
      rawRole: 'issue-worker',
      denials: [expect.objectContaining({
        role: 'issue-worker',
        requestedTool: 'read_file',
        reason: expect.stringContaining('not recognized'),
      })],
    });

    expect(validateAgentRoleTools({
      requestedTools: ['read_file'],
      skills: [],
    })).toMatchObject({
      allowed: false,
      denials: [expect.objectContaining({
        role: '<missing-role>',
        requestedTool: 'read_file',
        reason: expect.stringContaining('must include a role'),
      })],
    });

    expect(validateAgentRoleTools({
      agentRole: 'triage',
      skills: [],
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: [expect.objectContaining({
        requestedTool: '<missing-tool-manifest>',
        reason: expect.stringContaining('explicit least-privilege tool manifest'),
      })],
    });

    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: [expect.objectContaining({
        requestedTool: '<implicit-enabled-skills>',
        reason: expect.stringContaining('explicit skills allowlist'),
      })],
    });
  });

  it('allows every existing valid role when requested tools match its manifest exactly', () => {
    const manifests = roleToolManifests();

    for (const [agentRole, requestedTools] of Object.entries(manifests)) {
      expect(validateAgentRoleTools({
        agentRole,
        requestedTools,
        skills: [],
      })).toMatchObject({
        allowed: true,
        role: agentRole,
        requestedTools,
        denials: [],
      });
    }
  });

  it('fails closed when a selected skill has no trusted tool manifest or exposes out-of-role tools', () => {
    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['unknown-runtime-skill'],
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: [expect.objectContaining({
        requestedTool: 'skill:unknown-runtime-skill',
        reason: expect.stringContaining('cannot be validated'),
      })],
    });

    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['repo-writer'],
    }, {
      trustedSkillToolManifests: { 'repo-writer': ['patch'] },
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: [expect.objectContaining({
        role: 'triage',
        requestedTool: 'patch',
        reason: expect.stringContaining("not allowed for role 'triage'"),
      })],
    });
  });
});
