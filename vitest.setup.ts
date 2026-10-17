import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

// Many test files run in parallel, so a busy machine (or CI runner) can take longer than the
// default 1 second to render. A generous ceiling avoids false failures without slowing passing tests.
configure({ asyncUtilTimeout: 5000 });
