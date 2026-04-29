import z from 'zod';

export const idSchema = z.string().regex(/^(req|tsk)-\d{5}$/, 'Invalid ID format');
export const titleSchema = z
  .string()
  .min(1, 'Title cannot be empty')
  .max(100, 'Title cannot exceed 100 characters');
export const descriptionSchema = z.string().max(1000, 'Description cannot exceed 1000 characters');
export const statusSchema = z.enum(['ToDo', 'InProgress', 'Done']);
export const prioritySchema = z.number().int().min(1).max(5);
export const dependenciesSchema = z.array(idSchema);
export const acceptanceCriteriaSchema = z.array(
  z.string().max(256, 'Acceptance criteria cannot exceed 256 characters')
);
export const agentIdSchema = z.string().min(1, 'agent_id cannot be empty');

// Main Models
// ------------------------------------------------------------------

export const requirementSchema = z.object({
  id: idSchema,
  title: titleSchema,
  description: descriptionSchema,
  status: statusSchema,
  priority: prioritySchema,
  acceptanceCriteria: acceptanceCriteriaSchema,
  dependencies: dependenciesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const taskSchema = z.object({
  id: idSchema,
  parentReqId: idSchema,
  title: titleSchema,
  description: descriptionSchema,
  status: statusSchema,
  acceptanceCriteria: acceptanceCriteriaSchema,
  dependencies: dependenciesSchema,
  assignedTo: agentIdSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * @typedef {z.infer<typeof requirementSchema>} Requirement
 * @typedef {z.infer<typeof taskSchema>} Task
 */

// Requirements Commands
// ------------------------------------------------------------------

export const createRequirementInputSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  priority: prioritySchema,
  acceptanceCriteria: acceptanceCriteriaSchema,
  dependencies: dependenciesSchema,
});

export const createRequirementOutputSchema = requirementSchema;

export const updateRequirementInputSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  acceptanceCriteria: acceptanceCriteriaSchema.optional(),
  dependencies: dependenciesSchema.optional(),
});

export const updateRequirementOutputSchema = requirementSchema;

/**
 * @typedef {z.infer<typeof createRequirementInputSchema>} CreateRequirementInput
 * @typedef {z.output<typeof createRequirementOutputSchema>} CreateRequirementOutput
 * @typedef {z.infer<typeof updateRequirementInputSchema>} UpdateRequirementInput
 * @typedef {z.output<typeof updateRequirementOutputSchema>} UpdateRequirementOutput
 */

// Requirements Queries
// ------------------------------------------------------------------

export const getRequirementInputSchema = z.object({ id: idSchema });
export const getRequirementOutputSchema = requirementSchema;

export const listRequirementsInputSchema = z.object({
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
});
export const listRequirementsOutputSchema = z.array(requirementSchema);

/**
 * @typedef {z.infer<typeof getRequirementInputSchema>} GetRequirementInput
 * @typedef {z.output<typeof getRequirementOutputSchema>} GetRequirementOutput
 * @typedef {z.infer<typeof listRequirementsInputSchema>} ListRequirementsInput
 * @typedef {z.output<typeof listRequirementsOutputSchema>} ListRequirementsOutput
 */

// Task Commands
// ------------------------------------------------------------------

export const createTaskInputSchema = z.object({
  parentReqId: idSchema,
  title: titleSchema,
  description: descriptionSchema,
  acceptanceCriteria: acceptanceCriteriaSchema,
  dependencies: dependenciesSchema,
});
export const createTaskOutputSchema = taskSchema;

export const updateTaskInputSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  acceptanceCriteria: acceptanceCriteriaSchema.optional(),
  dependencies: dependenciesSchema.optional(),
});
export const updateTaskOutputSchema = taskSchema;

/**
 * @typedef {z.infer<typeof createTaskInputSchema>} CreateTaskInput
 * @typedef {z.output<typeof createTaskOutputSchema>} CreateTaskOutput
 * @typedef {z.infer<typeof updateTaskInputSchema>} UpdateTaskInput
 * @typedef {z.output<typeof updateTaskOutputSchema>} UpdateTaskOutput
 */

// Task Queries
// ------------------------------------------------------------------

export const getTaskInputSchema = z.object({ id: idSchema });
export const getTaskOutputSchema = taskSchema;

export const listTasksInputSchema = z.object({
  parentReqId: idSchema,
  status: statusSchema.optional(),
});
export const listTasksOutputSchema = z.array(taskSchema);

/**
 * @typedef {z.infer<typeof getTaskInputSchema>} GetTaskInput
 * @typedef {z.output<typeof getTaskOutputSchema>} GetTaskOutput
 * @typedef {z.infer<typeof listTasksInputSchema>} ListTasksInput
 * @typedef {z.output<typeof listTasksOutputSchema>} ListTasksOutput
 */

// Task Workflow Commands
// ------------------------------------------------------------------

export const pickTaskInputSchema = z.object({ taskId: idSchema, agentId: agentIdSchema });
export const pickTaskOutputSchema = taskSchema;

export const completeTaskInputSchema = z.object({ taskId: idSchema, agentId: agentIdSchema });
export const completeTaskOutputSchema = taskSchema;

export const releaseTaskInputSchema = z.object({ taskId: idSchema, agentId: agentIdSchema });
export const releaseTaskOutputSchema = taskSchema;

/**
 * @typedef {z.infer<typeof pickTaskInputSchema>} PickTaskInput
 * @typedef {z.output<typeof pickTaskOutputSchema>} PickTaskOutput
 * @typedef {z.infer<typeof completeTaskInputSchema>} CompleteTaskInput
 * @typedef {z.output<typeof completeTaskOutputSchema>} CompleteTaskOutput
 * @typedef {z.infer<typeof releaseTaskInputSchema>} ReleaseTaskInput
 * @typedef {z.output<typeof releaseTaskOutputSchema>} ReleaseTaskOutput
 */

// Admin Commands
// ------------------------------------------------------------------

export const forceReleaseTaskInputSchema = z.object({ taskId: idSchema });
export const forceReleaseTaskOutputSchema = taskSchema;

/**
 * @typedef {z.infer<typeof forceReleaseTaskInputSchema>} ForceReleaseTaskInput
 * @typedef {z.output<typeof forceReleaseTaskOutputSchema>} ForceReleaseTaskOutput
 */

// Task Recommendation Query
// ------------------------------------------------------------------

export const nextTaskInputSchema = z.object({ agentId: agentIdSchema });
export const nextTaskOutputSchema = taskSchema.nullable();

/**
 * @typedef {z.infer<typeof nextTaskInputSchema>} NextTaskInput
 * @typedef {z.output<typeof nextTaskOutputSchema>} NextTaskOutput
 */

// Deletion Commands
// ------------------------------------------------------------------

export const deleteRequirementInputSchema = z.object({ id: idSchema });
export const deleteRequirementOutputSchema = requirementSchema;

export const deleteTaskInputSchema = z.object({ id: idSchema });
export const deleteTaskOutputSchema = taskSchema;

/**
 * @typedef {z.infer<typeof deleteRequirementInputSchema>} DeleteRequirementInput
 * @typedef {z.output<typeof deleteRequirementOutputSchema>} DeleteRequirementOutput
 * @typedef {z.infer<typeof deleteTaskInputSchema>} DeleteTaskInput
 * @typedef {z.output<typeof deleteTaskOutputSchema>} DeleteTaskOutput
 */
