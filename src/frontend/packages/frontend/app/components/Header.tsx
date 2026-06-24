import { useEffect, useState, type MouseEvent } from "react";
import AppBar from "@mui/material/AppBar";
import Stack from "@mui/material/Stack";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Toolbar from "@mui/material/Toolbar";
import { Link, useLocation } from "react-router";
import findLastIndex from "lodash-es/findLastIndex";

export function Header() {
  const locations = [
    ["程序", "/"],
    ["分镜头", "/clip"],
    ["调度器", "/manager"],
    ["看板", "/dashboard"],
  ];

  const [value, setValue] = useState(0);
  const location = useLocation();
  useEffect(() => {
    const index = findLastIndex(locations, ([_, l]) => location.pathname.startsWith(l));
    if (index >= 0) {
      setValue(index);
    }
  }, [location])

  return (
    <AppBar className="static w-screen">
      <Toolbar className="gap-2 justify-center">
        <Stack direction={"row"} spacing={2}>
          <Tabs
            value={value}
            onChange={(_, v) => setValue(v)}
            textColor="primary"
            sx={{
              '& .MuiTabs-indicator': {
                backgroundColor: 'white',
              },
            }}
          >
            {
              locations.map(([label, l]) => {
                return (
                  <Tab label={label} sx={{ color: "white", '&.Mui-selected': { color: 'white' } }} component={Link} to={l} key={"tab" + l}/>
                )
              })
            }
          </Tabs>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
