import { describe, expect, it } from 'vitest';
import {
  defaultAgentToolPolicyConfig,
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
      denials: expect.arrayContaining([expect.objectContaining({
        role: 'triage',
        requestedTool: 'patch',
        reason: expect.stringContaining("not allowed for role 'triage'"),
      })]),
    });
  });

  it('rejects malformed skills allowlists instead of treating them as an explicit empty allowlist', () => {
    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: true,
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: [expect.objectContaining({
        requestedTool: '<malformed-skills-allowlist>',
        reason: expect.stringContaining('must be an explicit array'),
      })],
    });

    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['valid-skill', 123],
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: expect.arrayContaining([expect.objectContaining({
        requestedTool: '<malformed-skills-allowlist>',
        reason: expect.stringContaining('array of strings'),
      })]),
    });
  });

  it('rejects malformed tool manifest aliases instead of silently filtering entries', () => {
    for (const malformedPolicy of [
      { requestedTools: ['read_file', 123] },
      { tools: [null] },
      { enabledTools: true },
      { toolManifest: ['read_file', ''] },
    ]) {
      expect(validateAgentRoleTools({
        agentRole: 'triage',
        ...malformedPolicy,
        skills: [],
      })).toMatchObject({
        allowed: false,
        denials: expect.arrayContaining([expect.objectContaining({
          requestedTool: '<malformed-tool-manifest>',
          reason: expect.stringContaining('arrays of non-empty strings'),
        })]),
      });
    }
  });

  it('accepts trusted prompt-only skill manifests with no runtime tools', () => {
    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['prompt-context-only'],
    }, {
      trustedSkillToolManifests: { 'prompt-context-only': [] },
    })).toMatchObject({
      allowed: true,
      role: 'triage',
      denials: [],
    });
  });

  it('keeps CLI run-config skill descriptors separate from installed tool policy', () => {
    expect(validateAgentRoleTools({
      agentRole: 'coding',
      requestedTools: ['read_file'],
      skills: ['cli:01_setup'],
    })).toMatchObject({
      allowed: true,
      role: 'coding',
      denials: [],
    });
  });

  it('requires explicit manifests to cover inferred workflow, runtime, and skill tools', () => {
    expect(validateAgentRoleTools({
      agentRole: 'coding',
      requestedTools: ['read_file'],
      skills: [],
    }, { definitionId: 'martin-loop' })).toMatchObject({
      allowed: false,
      denials: expect.arrayContaining([expect.objectContaining({
        requestedTool: 'patch',
        reason: expect.stringContaining('must be declared'),
      })]),
    });

    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['github'],
    }, { trustedSkillToolManifests: { github: ['list_repos'] } })).toMatchObject({
      allowed: false,
      denials: expect.arrayContaining([expect.objectContaining({
        requestedTool: 'github.read',
        reason: expect.stringContaining('must be declared'),
      })]),
    });
  });

  it('maps trusted GitHub read tools to role capability ids', () => {
    for (const selectedSkill of ['github', 'github/list_repos', 'list_repos', 'github/get_pull_request', 'github/list_pull_request_files']) {
      expect(validateAgentRoleTools({
        agentRole: 'triage',
        requestedTools: ['read_file', 'github.read'],
        skills: [selectedSkill],
      }, { trustedSkillToolManifests: { github: ['list_repos', 'get_pull_request', 'list_pull_request_files'] } })).toMatchObject({
        allowed: true,
        denials: [],
      });
    }
  });

  it('treats manual PR creation as a runtime capability requiring explicit declaration', () => {
    expect(validateAgentRoleTools({
      agentRole: 'coding',
      requestedTools: ['read_file'],
      skills: [],
      gitConfig: { prCreation: 'manual' },
    })).toMatchObject({
      allowed: false,
      denials: expect.arrayContaining([expect.objectContaining({
        requestedTool: 'github.pr',
        reason: expect.stringContaining('must be declared'),
      })]),
    });

    expect(validateAgentRoleTools({
      agentRole: 'coding',
      requestedTools: ['read_file', 'github.pr'],
      skills: [],
      gitConfig: { prCreation: 'manual' },
    })).toMatchObject({ allowed: true, denials: [] });

    expect(validateAgentRoleTools({
      agentRole: 'coding',
      requestedTools: ['read_file'],
      skills: [],
      gitConfig: { prCreation: true },
    })).toMatchObject({
      allowed: false,
      denials: expect.arrayContaining([expect.objectContaining({ requestedTool: 'github.pr' })]),
    });
  });

  it('resolves selected runtime descriptor ids to their trusted parent skill manifest', () => {
    const context = {
      trustedSkillToolManifests: { 'repo-tools': ['read_file', 'patch'] },
    };

    for (const selectedSkill of ['repo-tools/read_file', 'read_file']) {
      expect(validateAgentRoleTools({
        agentRole: 'triage',
        requestedTools: ['read_file'],
        skills: [selectedSkill],
      }, context)).toMatchObject({
        allowed: true,
        role: 'triage',
        denials: [],
      });
    }
  });

  it('fails closed when a bare tool descriptor collides with an installed skill id', () => {
    expect(validateAgentRoleTools({
      agentRole: 'triage',
      requestedTools: ['read_file'],
      skills: ['terminal'],
    }, {
      trustedSkillToolManifests: {
        terminal: [],
        'ops-tools': ['terminal'],
      },
    })).toMatchObject({
      allowed: false,
      role: 'triage',
      denials: expect.arrayContaining([expect.objectContaining({
        requestedTool: 'terminal',
        reason: expect.stringContaining("not allowed for role 'triage'"),
      })]),
    });
  });

  it('derives explicit policy fields for tracked chat init shells', () => {
    expect(defaultAgentToolPolicyConfig('martin-loop', 'martin-loop')).toEqual({
      agentRole: 'coding',
      requestedTools: [
        'read_file', 'search_files', 'write_file', 'patch', 'terminal',
        'terminal.background', 'github.read', 'github.comment', 'github.pr', 'kanban.comment',
      ],
      skills: [],
    });

    expect(validateAgentRoleTools(defaultAgentToolPolicyConfig('martin-loop', 'martin-loop'), {
      definitionId: 'martin-loop',
      initActionKind: 'martin-loop',
    })).toMatchObject({ allowed: true, role: 'coding', denials: [] });
  });

  it('defaults document workflows to the docs least-privilege role', () => {
    expect(defaultAgentToolPolicyConfig('chunk-plan', 'chunk-plan')).toEqual({
      agentRole: 'docs',
      requestedTools: ['read_file', 'search_files', 'write_file'],
      skills: [],
    });
    expect(defaultAgentToolPolicyConfig('martin-loop', 'design-interview')).toEqual({
      agentRole: 'docs',
      requestedTools: ['read_file', 'write_file'],
      skills: [],
    });
  });
});
