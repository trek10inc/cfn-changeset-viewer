{
  settings.processes.npm-ci = {
    command = ''
      npm ci --include dev
    '';
  };
  settings.processes.node-test = {
    command = ''
      node --watch --test --test-reporter spec ./lib
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.simple = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/simple.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.simple_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/simple.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.unchanged-properties = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/unchanged-properties.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.unchanged-properties_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/unchanged-properties.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.nested = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/nested.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.nested_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/nested.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.import = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/import.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.import_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/import.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.stack-tags = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/stack-tags.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.stack-tags_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/stack-tags.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.deletion-policies = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/deletion-policies.json --show-unchanged-properties
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
  settings.processes.deletion-policies_no_unchanged = {
    command = ''
      node --watch index.mjs --change-set-name file://examples/deletion-policies.json
    '';
    depends_on = {
      npm-ci = {
        condition = "process_completed";
      };
    };
  };
}
