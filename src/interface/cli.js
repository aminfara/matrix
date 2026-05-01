#!/usr/bin/env node
import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { openDatabase } from '../db.js';
import {
  listRequirements,
  getRequirement,
  createRequirement,
  updateRequirement,
  deleteRequirement,
} from './commands/requirements.js';
import { listTasks, getTask, createTask, updateTask, deleteTask } from './commands/tasks.js';
import { pickTask, completeTask, releaseTask, forceReleaseTask } from './commands/workflow.js';
import { createApp } from './web/server.js';

const program = new Command();

program
  .name('matrix-mcp-cli')
  .description('MATRIX CLI and web interface')
  .option('--matrix-db-path <path>', 'Override database file path')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts['matrixDbPath']) {
      process.env['MATRIX_DB_PATH'] = String(opts['matrixDbPath']);
    }
  })
  .action(async () => {
    await runInteractiveMenu();
  });

const listCommand = program
  .command('list')
  .description('List requirements')
  .option('-s, --status <status>', 'Filter by status (ToDo | InProgress | Done)')
  .option('-p, --priority <n>', 'Filter by priority (1-5)')
  .action(async (options) => {
    await listRequirements(options);
  });

listCommand
  .command('tasks')
  .description('List tasks for a requirement')
  .requiredOption('--req <id>', 'Requirement ID')
  .option('-s, --status <status>', 'Filter by status (ToDo | InProgress | Done)')
  .action(async (options) => {
    await listTasks(options.req, { status: options.status });
  });

program
  .command('get')
  .argument('<id>', 'Requirement or task ID')
  .description('Get a requirement or task by ID')
  .action(async (id) => {
    if (isRequirementId(id)) {
      await getRequirement(id);
      return;
    }
    await getTask(id);
  });

const createCommand = program.command('create').description('Create requirement or task');

createCommand
  .command('requirement')
  .description('Create a requirement interactively')
  .action(async () => {
    await createRequirement();
  });

createCommand
  .command('task')
  .description('Create a task interactively')
  .requiredOption('--req <id>', 'Parent requirement ID')
  .action(async (options) => {
    await createTask(options.req);
  });

program
  .command('update')
  .argument('<id>', 'Requirement or task ID')
  .description('Update a requirement or task by ID')
  .action(async (id) => {
    if (isRequirementId(id)) {
      await updateRequirement(id);
      return;
    }
    await updateTask(id);
  });

program
  .command('delete')
  .argument('<id>', 'Requirement or task ID')
  .description('Delete a requirement or task by ID')
  .action(async (id) => {
    if (isRequirementId(id)) {
      await deleteRequirement(id);
      return;
    }
    await deleteTask(id);
  });

program
  .command('pick')
  .argument('<taskId>', 'Task ID')
  .requiredOption('--agent <agentId>', 'Agent ID')
  .description('Pick a task (ToDo -> InProgress)')
  .action(async (taskId, options) => {
    await pickTask(taskId, options.agent);
  });

program
  .command('complete')
  .argument('<taskId>', 'Task ID')
  .requiredOption('--agent <agentId>', 'Agent ID')
  .description('Complete a task (InProgress -> Done)')
  .action(async (taskId, options) => {
    await completeTask(taskId, options.agent);
  });

program
  .command('release')
  .argument('<taskId>', 'Task ID')
  .requiredOption('--agent <agentId>', 'Agent ID')
  .description('Release a task (InProgress -> ToDo)')
  .action(async (taskId, options) => {
    await releaseTask(taskId, options.agent);
  });

program
  .command('force-release')
  .argument('<taskId>', 'Task ID')
  .description('Force-release a task regardless of owner')
  .action(async (taskId) => {
    await forceReleaseTask(taskId);
  });

program
  .command('serve')
  .description('Start the MATRIX web interface')
  .option('-p, --port <n>', 'Port number', '3000')
  .action(async (options) => {
    const port = Number.parseInt(String(options.port), 10);
    if (Number.isNaN(port) || port <= 0) {
      console.error('Error [INVALID_INPUT]: Invalid port number');
      process.exit(1);
    }

    const db = openDatabase();
    const app = createApp(db);
    app.listen(port, '127.0.0.1', () => {
      console.log(`MATRIX UI running at http://localhost:${port}`);
    });
  });

await program.parseAsync(process.argv);

/**
 * @returns {Promise<void>}
 */
async function runInteractiveMenu() {
  let shouldExit = false;

  while (!shouldExit) {
    const choice = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'List requirements', value: 'listRequirements' },
        { name: 'Get a requirement or task', value: 'getById' },
        { name: 'Create a requirement', value: 'createRequirement' },
        { name: 'Create a task', value: 'createTask' },
        { name: 'Update a requirement or task', value: 'updateById' },
        { name: 'Delete a requirement or task', value: 'deleteById' },
        { name: 'Task workflow (pick / complete / release / force-release)', value: 'workflow' },
        { name: 'Start web interface', value: 'serve' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    switch (choice) {
      case 'listRequirements': {
        await listRequirements({});
        break;
      }
      case 'getById': {
        const id = await input({ message: 'Requirement or task ID' });
        if (isRequirementId(id)) {
          await getRequirement(id);
        } else {
          await getTask(id);
        }
        break;
      }
      case 'createRequirement': {
        await createRequirement();
        break;
      }
      case 'createTask': {
        const reqId = await input({ message: 'Parent requirement ID (req-xxxxx)' });
        await createTask(reqId);
        break;
      }
      case 'updateById': {
        const id = await input({ message: 'Requirement or task ID' });
        if (isRequirementId(id)) {
          await updateRequirement(id);
        } else {
          await updateTask(id);
        }
        break;
      }
      case 'deleteById': {
        const id = await input({ message: 'Requirement or task ID' });
        if (isRequirementId(id)) {
          await deleteRequirement(id);
        } else {
          await deleteTask(id);
        }
        break;
      }
      case 'workflow': {
        const taskId = await input({ message: 'Task ID (tsk-xxxxx)' });
        const action = await select({
          message: 'Workflow action',
          choices: [
            { name: 'Pick', value: 'pick' },
            { name: 'Complete', value: 'complete' },
            { name: 'Release', value: 'release' },
            { name: 'Force release', value: 'forceRelease' },
          ],
        });

        if (action === 'forceRelease') {
          await forceReleaseTask(taskId);
          break;
        }

        const agentId = await input({ message: 'Agent ID' });

        if (action === 'pick') {
          await pickTask(taskId, agentId);
        } else if (action === 'complete') {
          await completeTask(taskId, agentId);
        } else {
          await releaseTask(taskId, agentId);
        }
        break;
      }
      case 'serve': {
        const portInput = await input({ message: 'Port', default: '3000' });
        const port = Number.parseInt(portInput, 10);
        if (Number.isNaN(port) || port <= 0) {
          console.error('Error [INVALID_INPUT]: Invalid port number');
          break;
        }

        const db = openDatabase();
        const app = createApp(db);
        app.listen(port, '127.0.0.1', () => {
          console.log(`MATRIX UI running at http://localhost:${port}`);
        });
        shouldExit = true;
        break;
      }
      case 'exit': {
        shouldExit = true;
        break;
      }
      default:
        shouldExit = true;
    }
  }
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isRequirementId(id) {
  return id.startsWith('req-');
}
